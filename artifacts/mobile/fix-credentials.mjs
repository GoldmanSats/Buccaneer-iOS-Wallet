import https from 'https';
import fs from 'fs';
import crypto from 'crypto';
import { execSync } from 'child_process';

const EXPO_TOKEN = process.env.EXPO_TOKEN;
const ASC_KEY_ID = '459TANN95N';
const ASC_ISSUER_ID = 'e94ce994-3806-429b-ad7e-a1d10cf2e842';
const ASC_KEY_PATH = '/home/runner/workspace/artifacts/mobile/AuthKey_459TANN95N.p8';
const BUNDLE_ID = 'com.buccaneer.wallet';
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
  if (!fs.existsSync(WORK_DIR)) fs.mkdirSync(WORK_DIR, { recursive: true });

  console.log('=== PHASE 1: Clean up old credentials on Expo ===');

  const existingCredsResp = await expoGraphQL(`query { app { byFullName(fullName: "@kirkish/buccaneer-wallet") { iosAppCredentials { id iosAppBuildCredentialsList { id iosDistributionType distributionCertificate { id serialNumber } provisioningProfile { id } } } } } }`);
  const existingCreds = existingCredsResp.data?.data?.app?.byFullName?.iosAppCredentials || [];
  console.log(`Found ${existingCreds.length} existing credential sets on Expo`);

  for (const cred of existingCreds) {
    for (const bc of (cred.iosAppBuildCredentialsList || [])) {
      console.log(`Deleting build credentials ${bc.id}...`);
      await expoGraphQL(`mutation { iosAppBuildCredentials { deleteIosAppBuildCredentials(id: "${bc.id}") { id } } }`);
    }
    console.log(`Deleting app credentials ${cred.id}...`);
    await expoGraphQL(`mutation { iosAppCredentials { deleteIosAppCredentials(id: "${cred.id}") { id } } }`);
  }

  const existingDistCertsQuery = `query { account { byId(accountId: "${ACCOUNT_ID}") { appleDistributionCertificates { id serialNumber } } } }`;
  const distCertsResp = await expoGraphQL(existingDistCertsQuery);
  const distCerts = distCertsResp.data?.data?.account?.byId?.appleDistributionCertificates || [];
  console.log(`Found ${distCerts.length} distribution certificates on Expo`);
  for (const cert of distCerts) {
    console.log(`Deleting dist cert ${cert.id} (${cert.serialNumber})...`);
    await expoGraphQL(`mutation { appleDistributionCertificate { deleteAppleDistributionCertificate(id: "${cert.id}") { id } } }`);
  }

  const existingProvsQuery = `query { account { byId(accountId: "${ACCOUNT_ID}") { appleProvisioningProfiles { id developerPortalIdentifier } } } }`;
  const provsResp = await expoGraphQL(existingProvsQuery);
  const provs = provsResp.data?.data?.account?.byId?.appleProvisioningProfiles || [];
  console.log(`Found ${provs.length} provisioning profiles on Expo`);
  for (const prov of provs) {
    console.log(`Deleting prov profile ${prov.id}...`);
    await expoGraphQL(`mutation { appleProvisioningProfile { deleteAppleProvisioningProfile(id: "${prov.id}") { id } } }`);
  }

  console.log('\n=== PHASE 2: Clean up old certs on Apple ===');
  const appleCerts = await appleAPI('/certificates?filter[certificateType]=IOS_DISTRIBUTION&limit=10');
  for (const cert of (appleCerts.data?.data || [])) {
    console.log(`Revoking Apple cert ${cert.attributes.serialNumber} (${cert.id})...`);
    await appleAPI(`/certificates/${cert.id}`, 'DELETE');
  }

  const appleProfiles = await appleAPI('/profiles?filter[profileType]=IOS_APP_STORE&limit=20');
  for (const prof of (appleProfiles.data?.data || [])) {
    console.log(`Deleting Apple profile ${prof.attributes.name}...`);
    await appleAPI(`/profiles/${prof.id}`, 'DELETE');
  }

  console.log('\n=== PHASE 3: Create fresh certificate ===');
  console.log('Generating 2048-bit RSA key and CSR...');
  execSync(`openssl genrsa -out dist.key 2048`, { cwd: WORK_DIR });
  execSync(`openssl req -new -key dist.key -out dist.csr -subj "/emailAddress=kirkland.kaye@protonmail.com/CN=iPhone Distribution: KIRKLAND MORGAN KAYE/O=KIRKLAND MORGAN KAYE"`, { cwd: WORK_DIR });

  const csrContent = fs.readFileSync(`${WORK_DIR}/dist.csr`, 'utf8');
  console.log('Submitting CSR to Apple...');

  const certResp = await appleAPI('/certificates', 'POST', {
    data: {
      type: 'certificates',
      attributes: {
        csrContent: csrContent,
        certificateType: 'IOS_DISTRIBUTION'
      }
    }
  });

  if (certResp.status !== 201) {
    console.error('Certificate creation failed:', JSON.stringify(certResp.data, null, 2));
    return;
  }

  const newCert = certResp.data.data;
  console.log(`Certificate created: ${newCert.attributes.serialNumber}`);
  console.log(`Name: ${newCert.attributes.name}`);
  console.log(`Expires: ${newCert.attributes.expirationDate}`);

  const certDer = Buffer.from(newCert.attributes.certificateContent, 'base64');
  fs.writeFileSync(`${WORK_DIR}/dist.cer`, certDer);

  execSync(`openssl x509 -inform DER -in dist.cer -out dist.pem -outform PEM`, { cwd: WORK_DIR });

  console.log('\nVerifying certificate matches key...');
  const certModulus = execSync(`openssl x509 -noout -modulus -in dist.pem`, { cwd: WORK_DIR }).toString().trim();
  const keyModulus = execSync(`openssl rsa -noout -modulus -in dist.key`, { cwd: WORK_DIR }).toString().trim();
  if (certModulus === keyModulus) {
    console.log('Certificate and key MATCH!');
  } else {
    console.error('MISMATCH - certificate and key do not match!');
    return;
  }

  console.log('\nCreating P12 bundle...');
  execSync(`openssl pkcs12 -export -out dist.p12 -inkey dist.key -in dist.pem -passout pass:""`, { cwd: WORK_DIR });

  const p12Data = fs.readFileSync(`${WORK_DIR}/dist.p12`);
  console.log(`P12 size: ${p12Data.length} bytes`);

  console.log('\nVerifying P12 is valid...');
  try {
    const p12Info = execSync(`openssl pkcs12 -in dist.p12 -info -passin pass:"" -nokeys -noout 2>&1`, { cwd: WORK_DIR }).toString();
    console.log('P12 verified OK');
  } catch (e) {
    console.log('P12 info output:', e.stdout?.toString() || e.message);
  }

  console.log('\n=== PHASE 4: Create provisioning profile ===');
  const bundleIdResp = await appleAPI(`/bundleIds?filter[identifier]=${BUNDLE_ID}`);
  const bundleIdObj = bundleIdResp.data?.data?.[0];
  if (!bundleIdObj) { console.error('Bundle ID not found'); return; }
  console.log(`Bundle ID: ${bundleIdObj.attributes.identifier} (${bundleIdObj.id})`);

  const profileResp = await appleAPI('/profiles', 'POST', {
    data: {
      type: 'profiles',
      attributes: { name: 'Buccaneer Wallet AppStore', profileType: 'IOS_APP_STORE' },
      relationships: {
        bundleId: { data: { type: 'bundleIds', id: bundleIdObj.id } },
        certificates: { data: [{ type: 'certificates', id: newCert.id }] }
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
  const teamNameMatch = profileStr.match(/<key>TeamName<\/key>\s*<string>([^<]+)<\/string>/);
  const appleTeamIdentifier = teamIdMatch?.[1] || 'FR97GP6Z7W';
  const appleTeamName = teamNameMatch?.[1] || 'KIRKLAND MORGAN KAYE';

  console.log('\n=== PHASE 5: Upload everything to Expo ===');

  const teamsResp = await expoGraphQL(`query { account { byId(accountId: "${ACCOUNT_ID}") { appleTeams { id appleTeamIdentifier } } } }`);
  let appleTeamId;
  const existingTeam = (teamsResp.data?.data?.account?.byId?.appleTeams || []).find(t => t.appleTeamIdentifier === appleTeamIdentifier);
  if (existingTeam) {
    appleTeamId = existingTeam.id;
    console.log(`Using existing Expo team: ${appleTeamId}`);
  } else {
    const createTeamResp = await expoGraphQL(`mutation { appleTeam { createAppleTeam(appleTeamInput: { appleTeamIdentifier: "${appleTeamIdentifier}", appleTeamName: "${appleTeamName}" }, accountId: "${ACCOUNT_ID}") { id } } }`);
    appleTeamId = createTeamResp.data?.data?.appleTeam?.createAppleTeam?.id;
    console.log(`Created Expo team: ${appleTeamId}`);
  }

  console.log('\nUploading Distribution Certificate...');
  const p12Base64 = p12Data.toString('base64');
  const uploadCertResp = await expoGraphQL(`
    mutation UploadCert($input: AppleDistributionCertificateInput!, $accountId: ID!) {
      appleDistributionCertificate {
        createAppleDistributionCertificate(appleDistributionCertificateInput: $input, accountId: $accountId) {
          id
          serialNumber
          validityNotAfter
        }
      }
    }
  `, {
    input: {
      certP12: p12Base64,
      certPassword: "",
      developerPortalIdentifier: newCert.id,
    },
    accountId: ACCOUNT_ID
  });

  if (uploadCertResp.data?.errors) {
    console.error('Cert upload error:', JSON.stringify(uploadCertResp.data.errors, null, 2));
    return;
  }
  const expoCert = uploadCertResp.data.data.appleDistributionCertificate.createAppleDistributionCertificate;
  console.log(`Uploaded cert: ${expoCert.id} (serial: ${expoCert.serialNumber})`);

  console.log('\nGetting Apple App Identifier...');
  const appIdsResp = await expoGraphQL(`query { account { byId(accountId: "${ACCOUNT_ID}") { appleAppIdentifiers { id bundleIdentifier } } } }`);
  let appleAppIdentifierId = (appIdsResp.data?.data?.account?.byId?.appleAppIdentifiers || []).find(i => i.bundleIdentifier === BUNDLE_ID)?.id;
  if (!appleAppIdentifierId) {
    const createAppIdResp = await expoGraphQL(`mutation { appleAppIdentifier { createAppleAppIdentifier(appleAppIdentifierInput: { bundleIdentifier: "${BUNDLE_ID}" }, accountId: "${ACCOUNT_ID}") { id } } }`);
    appleAppIdentifierId = createAppIdResp.data?.data?.appleAppIdentifier?.createAppleAppIdentifier?.id;
  }
  console.log(`Apple App Identifier: ${appleAppIdentifierId}`);

  console.log('\nCreating iOS App Credentials...');
  const createCredsResp = await expoGraphQL(`mutation { iosAppCredentials { createIosAppCredentials(iosAppCredentialsInput: { appleTeamId: "${appleTeamId}" }, appId: "${APP_ID}", appleAppIdentifierId: "${appleAppIdentifierId}") { id } } }`);
  let iosAppCredentialsId;
  if (createCredsResp.data?.errors) {
    console.log('Note:', createCredsResp.data.errors[0]?.message);
    const existCredsResp = await expoGraphQL(`query { app { byFullName(fullName: "@kirkish/buccaneer-wallet") { iosAppCredentials { id } } } }`);
    iosAppCredentialsId = existCredsResp.data?.data?.app?.byFullName?.iosAppCredentials?.[0]?.id;
  } else {
    iosAppCredentialsId = createCredsResp.data?.data?.iosAppCredentials?.createIosAppCredentials?.id;
  }
  console.log(`iOS App Credentials: ${iosAppCredentialsId}`);

  console.log('\nUploading Provisioning Profile...');
  const createProvResp = await expoGraphQL(`
    mutation CreateProv($input: AppleProvisioningProfileInput!, $accountId: ID!, $appleAppIdentifierId: ID!) {
      appleProvisioningProfile {
        createAppleProvisioningProfile(appleProvisioningProfileInput: $input, accountId: $accountId, appleAppIdentifierId: $appleAppIdentifierId) {
          id
          developerPortalIdentifier
        }
      }
    }
  `, {
    input: {
      appleProvisioningProfile: profile.attributes.profileContent,
      developerPortalIdentifier: profile.attributes.uuid
    },
    accountId: ACCOUNT_ID,
    appleAppIdentifierId: appleAppIdentifierId
  });

  if (createProvResp.data?.errors) {
    console.error('Prov profile error:', createProvResp.data.errors[0]?.message);
    return;
  }
  const provProfileId = createProvResp.data.data.appleProvisioningProfile.createAppleProvisioningProfile.id;
  console.log(`Provisioning Profile: ${provProfileId}`);

  console.log('\nCreating Build Credentials...');
  const createBuildCredsResp = await expoGraphQL(`mutation { iosAppBuildCredentials { createIosAppBuildCredentials(iosAppBuildCredentialsInput: { iosDistributionType: APP_STORE, distributionCertificateId: "${expoCert.id}", provisioningProfileId: "${provProfileId}" }, iosAppCredentialsId: "${iosAppCredentialsId}") { id iosDistributionType } } }`);
  if (createBuildCredsResp.data?.errors) {
    console.error('Build creds error:', createBuildCredsResp.data.errors[0]?.message);
  } else {
    const bc = createBuildCredsResp.data.data.iosAppBuildCredentials.createIosAppBuildCredentials;
    console.log(`Build Credentials: ${bc.id} (${bc.iosDistributionType})`);
  }

  console.log('\n' + '='.repeat(50));
  console.log('  CREDENTIALS REBUILT FROM SCRATCH');
  console.log('='.repeat(50));
  console.log(`New Cert Serial: ${newCert.attributes.serialNumber}`);
  console.log(`Profile UUID: ${profile.attributes.uuid}`);
  console.log('\nKey files in:', WORK_DIR);
  console.log('Ready for build!');
}

main().catch(console.error);
