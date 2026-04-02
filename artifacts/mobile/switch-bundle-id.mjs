import https from 'https';
import fs from 'fs';
import crypto from 'crypto';

const EXPO_TOKEN = process.env.EXPO_TOKEN;
const ASC_KEY_ID = '459TANN95N';
const ASC_ISSUER_ID = 'e94ce994-3806-429b-ad7e-a1d10cf2e842';
const ASC_KEY_PATH = '/home/runner/workspace/artifacts/mobile/AuthKey_459TANN95N.p8';
const NEW_BUNDLE_ID = 'buccaneerwallet';
const APPLE_BUNDLE_ID_RESOURCE = '277468M43B';
const APP_ID = 'd0acdd36-77e7-4ee1-b945-21f8c9e4867f';
const ACCOUNT_ID = '3eaa605c-29aa-43e6-be97-2077dda0d962';
const WORK_DIR = '/home/runner/workspace/artifacts/mobile/creds_work';

function createAppleJWT() {
  const privateKey = fs.readFileSync(ASC_KEY_PATH, 'utf8');
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: ASC_ISSUER_ID, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' })).toString('base64url');
  const signInput = `${header}.${payload}`;
  const key = crypto.createPrivateKey(privateKey);
  const sig = crypto.sign('SHA256', Buffer.from(signInput), { key, dsaEncoding: 'ieee-p1363' });
  return `${signInput}.${sig.toString('base64url')}`;
}

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

async function appleAPI(path, method = 'GET', body = null) {
  return apiRequest('api.appstoreconnect.apple.com', `/v1${path}`, method, body, createAppleJWT());
}

async function main() {
  console.log('=== Step 1: Get current distribution certificate ===');
  const certResp = await appleAPI('/certificates?filter%5BcertificateType%5D=IOS_DISTRIBUTION&limit=5');
  const cert = certResp.data?.data?.[0];
  if (!cert) { console.error('No cert found'); return; }
  console.log(`Cert: ${cert.attributes.serialNumber} (${cert.id})`);

  console.log('\n=== Step 2: Create provisioning profile for buccaneerwallet ===');
  const existingProfiles = await appleAPI('/v1/profiles?filter%5BprofileType%5D=IOS_APP_STORE&limit=20');
  for (const p of (existingProfiles.data?.data || [])) {
    if (p.attributes.name.includes('buccaneerwallet') || p.attributes.name.includes('Buccaneer')) {
      console.log(`Deleting old profile: ${p.attributes.name}...`);
      await appleAPI(`/profiles/${p.id}`, 'DELETE');
    }
  }

  const profileResp = await appleAPI('/profiles', 'POST', {
    data: {
      type: 'profiles',
      attributes: { name: 'buccaneerwallet AppStore', profileType: 'IOS_APP_STORE' },
      relationships: {
        bundleId: { data: { type: 'bundleIds', id: APPLE_BUNDLE_ID_RESOURCE } },
        certificates: { data: [{ type: 'certificates', id: cert.id }] }
      }
    }
  });

  if (profileResp.status !== 201) {
    console.error('Profile creation failed:', JSON.stringify(profileResp.data, null, 2));
    return;
  }
  const profile = profileResp.data.data;
  console.log(`Profile: ${profile.attributes.name} (UUID: ${profile.attributes.uuid})`);

  const profileBuf = Buffer.from(profile.attributes.profileContent, 'base64');
  const profileStr = profileBuf.toString('utf8');
  const teamIdMatch = profileStr.match(/<key>TeamIdentifier<\/key>\s*<array>\s*<string>([^<]+)<\/string>/);
  const appleTeamIdentifier = teamIdMatch?.[1] || 'FR97GP6Z7W';

  console.log('\n=== Step 3: Clean up old Expo credentials for com.buccaneer.wallet ===');
  const existingCredsResp = await expoGraphQL(`query { app { byFullName(fullName: "@kirkish/buccaneer-wallet") { iosAppCredentials { id iosAppBuildCredentialsList { id } } } } }`);
  for (const cred of (existingCredsResp.data?.data?.app?.byFullName?.iosAppCredentials || [])) {
    for (const bc of (cred.iosAppBuildCredentialsList || [])) {
      await expoGraphQL(`mutation { iosAppBuildCredentials { deleteIosAppBuildCredentials(id: "${bc.id}") { id } } }`);
    }
    await expoGraphQL(`mutation { iosAppCredentials { deleteIosAppCredentials(id: "${cred.id}") { id } } }`);
  }

  const provsResp = await expoGraphQL(`query { account { byId(accountId: "${ACCOUNT_ID}") { appleProvisioningProfiles { id } } } }`);
  for (const p of (provsResp.data?.data?.account?.byId?.appleProvisioningProfiles || [])) {
    await expoGraphQL(`mutation { appleProvisioningProfile { deleteAppleProvisioningProfile(id: "${p.id}") { id } } }`);
  }

  console.log('\n=== Step 4: Set up Expo credentials for buccaneerwallet ===');

  const teamsResp = await expoGraphQL(`query { account { byId(accountId: "${ACCOUNT_ID}") { appleTeams { id appleTeamIdentifier } } } }`);
  const appleTeamId = (teamsResp.data?.data?.account?.byId?.appleTeams || []).find(t => t.appleTeamIdentifier === appleTeamIdentifier)?.id;
  console.log(`Team: ${appleTeamId}`);

  const distCertsResp = await expoGraphQL(`query { account { byId(accountId: "${ACCOUNT_ID}") { appleDistributionCertificates { id serialNumber } } } }`);
  const expoCertId = distCertsResp.data?.data?.account?.byId?.appleDistributionCertificates?.[0]?.id;
  console.log(`Dist cert: ${expoCertId}`);

  let appleAppIdentifierId;
  const createAppIdResp = await expoGraphQL(`mutation { appleAppIdentifier { createAppleAppIdentifier(appleAppIdentifierInput: { bundleIdentifier: "${NEW_BUNDLE_ID}" }, accountId: "${ACCOUNT_ID}") { id bundleIdentifier } } }`);
  if (createAppIdResp.data?.errors) {
    console.log('App ID note:', createAppIdResp.data.errors[0]?.message);
    const existingIds = await expoGraphQL(`query { account { byId(accountId: "${ACCOUNT_ID}") { appleAppIdentifiers { id bundleIdentifier } } } }`);
    appleAppIdentifierId = (existingIds.data?.data?.account?.byId?.appleAppIdentifiers || []).find(i => i.bundleIdentifier === NEW_BUNDLE_ID)?.id;
  } else {
    appleAppIdentifierId = createAppIdResp.data?.data?.appleAppIdentifier?.createAppleAppIdentifier?.id;
  }
  console.log(`App Identifier: ${appleAppIdentifierId}`);

  const provResp = await expoGraphQL(`
    mutation CreateProv($input: AppleProvisioningProfileInput!, $accountId: ID!, $appleAppIdentifierId: ID!) {
      appleProvisioningProfile {
        createAppleProvisioningProfile(appleProvisioningProfileInput: $input, accountId: $accountId, appleAppIdentifierId: $appleAppIdentifierId) { id }
      }
    }
  `, {
    input: { appleProvisioningProfile: profile.attributes.profileContent, developerPortalIdentifier: profile.attributes.uuid },
    accountId: ACCOUNT_ID,
    appleAppIdentifierId
  });
  if (provResp.data?.errors) { console.error('Prov error:', provResp.data.errors[0]?.message); return; }
  const provId = provResp.data.data.appleProvisioningProfile.createAppleProvisioningProfile.id;
  console.log(`Prov Profile: ${provId}`);

  const credsResp = await expoGraphQL(`mutation { iosAppCredentials { createIosAppCredentials(iosAppCredentialsInput: { appleTeamId: "${appleTeamId}" }, appId: "${APP_ID}", appleAppIdentifierId: "${appleAppIdentifierId}") { id } } }`);
  let iosAppCredentialsId;
  if (credsResp.data?.errors) {
    const existResp = await expoGraphQL(`query { app { byFullName(fullName: "@kirkish/buccaneer-wallet") { iosAppCredentials { id } } } }`);
    iosAppCredentialsId = existResp.data?.data?.app?.byFullName?.iosAppCredentials?.[0]?.id;
  } else {
    iosAppCredentialsId = credsResp.data?.data?.iosAppCredentials?.createIosAppCredentials?.id;
  }
  console.log(`App Credentials: ${iosAppCredentialsId}`);

  const bcResp = await expoGraphQL(`mutation { iosAppBuildCredentials { createIosAppBuildCredentials(iosAppBuildCredentialsInput: { iosDistributionType: APP_STORE, distributionCertificateId: "${expoCertId}", provisioningProfileId: "${provId}" }, iosAppCredentialsId: "${iosAppCredentialsId}") { id iosDistributionType } } }`);
  if (bcResp.data?.errors) {
    console.error('Build creds error:', bcResp.data.errors[0]?.message);
  } else {
    console.log(`Build Credentials: ${bcResp.data.data.iosAppBuildCredentials.createIosAppBuildCredentials.id}`);
  }

  console.log('\n=== ALL DONE ===');
  console.log('Bundle ID switched to: buccaneerwallet');
  console.log('Ready for build + submit!');
}

main().catch(console.error);
