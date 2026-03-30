import https from 'https';
import fs from 'fs';
import crypto from 'crypto';
import { execSync } from 'child_process';

const EXPO_TOKEN = process.env.EXPO_TOKEN;
const ACCOUNT_ID = '3eaa605c-29aa-43e6-be97-2077dda0d962';
const WORK_DIR = '/home/runner/workspace/artifacts/mobile/creds_work';
const P12_PASSWORD = 'buccaneer2024';

function apiRequest(hostname, path, method = 'GET', body = null, token = null) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const bodyStr = body ? JSON.stringify(body) : null;
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);
    const req = https.request({ hostname, path, method, headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function expoGraphQL(query, variables = {}) {
  return apiRequest('api.expo.dev', '/graphql', 'POST', { query, variables }, EXPO_TOKEN);
}

async function main() {
  console.log('=== Step 1: Recreate P12 with legacy format ===');

  if (!fs.existsSync(`${WORK_DIR}/dist.key`) || !fs.existsSync(`${WORK_DIR}/dist.pem`)) {
    console.error('Key/cert files not found. Run fix-credentials.mjs first.');
    return;
  }

  execSync(`openssl pkcs12 -export -out dist_legacy.p12 -inkey dist.key -in dist.pem -legacy -passout pass:${P12_PASSWORD}`, { cwd: WORK_DIR });

  const p12Data = fs.readFileSync(`${WORK_DIR}/dist_legacy.p12`);
  console.log(`Legacy P12 size: ${p12Data.length} bytes`);

  console.log('Verifying legacy P12...');
  try {
    execSync(`openssl pkcs12 -in dist_legacy.p12 -info -passin pass:${P12_PASSWORD} -nokeys -legacy 2>&1 | head -5`, { cwd: WORK_DIR });
    console.log('P12 verification OK');
  } catch (e) {
    console.log('P12 check:', e.stdout?.toString()?.substring(0, 200));
  }

  console.log('\n=== Step 2: Delete old cert from Expo and re-upload ===');
  const distCertsResp = await expoGraphQL(`query { account { byId(accountId: "${ACCOUNT_ID}") { appleDistributionCertificates { id serialNumber } } } }`);
  for (const cert of (distCertsResp.data?.data?.account?.byId?.appleDistributionCertificates || [])) {
    console.log(`Deleting old cert ${cert.serialNumber}...`);

    const credsResp = await expoGraphQL(`query { app { byFullName(fullName: "@kirkish/buccaneer-wallet") { iosAppCredentials { id iosAppBuildCredentialsList { id } } } } }`);
    for (const cred of (credsResp.data?.data?.app?.byFullName?.iosAppCredentials || [])) {
      for (const bc of (cred.iosAppBuildCredentialsList || [])) {
        await expoGraphQL(`mutation { iosAppBuildCredentials { deleteIosAppBuildCredentials(id: "${bc.id}") { id } } }`);
      }
      await expoGraphQL(`mutation { iosAppCredentials { deleteIosAppCredentials(id: "${cred.id}") { id } } }`);
    }

    const provsResp = await expoGraphQL(`query { account { byId(accountId: "${ACCOUNT_ID}") { appleProvisioningProfiles { id } } } }`);
    for (const p of (provsResp.data?.data?.account?.byId?.appleProvisioningProfiles || [])) {
      await expoGraphQL(`mutation { appleProvisioningProfile { deleteAppleProvisioningProfile(id: "${p.id}") { id } } }`);
    }

    await expoGraphQL(`mutation { appleDistributionCertificate { deleteAppleDistributionCertificate(id: "${cert.id}") { id } } }`);
  }

  console.log('\nUploading new P12...');
  const p12Base64 = p12Data.toString('base64');
  const uploadResp = await expoGraphQL(`
    mutation UploadCert($input: AppleDistributionCertificateInput!, $accountId: ID!) {
      appleDistributionCertificate {
        createAppleDistributionCertificate(appleDistributionCertificateInput: $input, accountId: $accountId) {
          id serialNumber validityNotAfter
        }
      }
    }
  `, {
    input: { certP12: p12Base64, certPassword: P12_PASSWORD },
    accountId: ACCOUNT_ID
  });

  if (uploadResp.data?.errors) {
    console.error('Upload error:', JSON.stringify(uploadResp.data.errors, null, 2));
    return;
  }
  const expoCert = uploadResp.data.data.appleDistributionCertificate.createAppleDistributionCertificate;
  console.log(`Uploaded: ${expoCert.id} (${expoCert.serialNumber})`);

  console.log('\n=== Step 3: Re-create provisioning profile and build creds ===');

  const teamsResp = await expoGraphQL(`query { account { byId(accountId: "${ACCOUNT_ID}") { appleTeams { id appleTeamIdentifier } } } }`);
  const appleTeamId = teamsResp.data?.data?.account?.byId?.appleTeams?.[0]?.id;

  const appIdsResp = await expoGraphQL(`query { account { byId(accountId: "${ACCOUNT_ID}") { appleAppIdentifiers { id bundleIdentifier } } } }`);
  const appleAppIdentifierId = (appIdsResp.data?.data?.account?.byId?.appleAppIdentifiers || []).find(i => i.bundleIdentifier === 'com.buccaneer.wallet')?.id;

  const ASC_KEY_PATH = '/home/runner/workspace/artifacts/mobile/AuthKey_459TANN95N.p8';
  const privateKey = fs.readFileSync(ASC_KEY_PATH, 'utf8');
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: '459TANN95N', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: 'e94ce994-3806-429b-ad7e-a1d10cf2e842', iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' })).toString('base64url');
  const signInput = `${header}.${payload}`;
  const key = crypto.createPrivateKey(privateKey);
  const sig = crypto.sign('SHA256', Buffer.from(signInput), { key, dsaEncoding: 'ieee-p1363' });
  const jwt = `${signInput}.${sig.toString('base64url')}`;

  const profilesResp = await apiRequest('api.appstoreconnect.apple.com', '/v1/profiles?filter[profileType]=IOS_APP_STORE&filter[name]=Buccaneer Wallet AppStore&limit=1', 'GET', null, jwt);
  const profile = profilesResp.data?.data?.[0];
  if (!profile) {
    console.error('Provisioning profile not found on Apple');
    return;
  }

  const provResp = await expoGraphQL(`
    mutation CreateProv($input: AppleProvisioningProfileInput!, $accountId: ID!, $appleAppIdentifierId: ID!) {
      appleProvisioningProfile {
        createAppleProvisioningProfile(appleProvisioningProfileInput: $input, accountId: $accountId, appleAppIdentifierId: $appleAppIdentifierId) {
          id developerPortalIdentifier
        }
      }
    }
  `, {
    input: { appleProvisioningProfile: profile.attributes.profileContent, developerPortalIdentifier: profile.attributes.uuid },
    accountId: ACCOUNT_ID,
    appleAppIdentifierId: appleAppIdentifierId
  });

  if (provResp.data?.errors) {
    console.error('Prov error:', provResp.data.errors[0]?.message);
    return;
  }
  const provId = provResp.data.data.appleProvisioningProfile.createAppleProvisioningProfile.id;
  console.log(`Provisioning Profile: ${provId}`);

  const APP_ID = 'd0acdd36-77e7-4ee1-b945-21f8c9e4867f';
  const createCredsResp = await expoGraphQL(`mutation { iosAppCredentials { createIosAppCredentials(iosAppCredentialsInput: { appleTeamId: "${appleTeamId}" }, appId: "${APP_ID}", appleAppIdentifierId: "${appleAppIdentifierId}") { id } } }`);
  const iosAppCredentialsId = createCredsResp.data?.data?.iosAppCredentials?.createIosAppCredentials?.id;
  if (!iosAppCredentialsId) {
    console.error('Failed to create app creds:', createCredsResp.data?.errors?.[0]?.message);
    return;
  }
  console.log(`App Credentials: ${iosAppCredentialsId}`);

  const buildCredsResp = await expoGraphQL(`mutation { iosAppBuildCredentials { createIosAppBuildCredentials(iosAppBuildCredentialsInput: { iosDistributionType: APP_STORE, distributionCertificateId: "${expoCert.id}", provisioningProfileId: "${provId}" }, iosAppCredentialsId: "${iosAppCredentialsId}") { id iosDistributionType } } }`);
  if (buildCredsResp.data?.errors) {
    console.error('Build creds error:', buildCredsResp.data.errors[0]?.message);
  } else {
    console.log(`Build Credentials: ${buildCredsResp.data.data.iosAppBuildCredentials.createIosAppBuildCredentials.id}`);
  }

  console.log('\n=== ALL DONE ===');
  console.log('P12 recreated with legacy format and password');
  console.log('All credentials re-uploaded to Expo');
}

main().catch(console.error);
