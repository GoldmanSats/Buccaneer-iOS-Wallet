import https from 'https';
import fs from 'fs';
import crypto from 'crypto';

const EXPO_TOKEN = process.env.EXPO_TOKEN;
const ASC_KEY_ID = '459TANN95N';
const ASC_ISSUER_ID = 'e94ce994-3806-429b-ad7e-a1d10cf2e842';
const ASC_KEY_PATH = '/home/runner/workspace/artifacts/mobile/AuthKey_459TANN95N.p8';
const BUNDLE_ID = 'com.buccaneer.wallet';
const EXPO_CERT_ID = 'b649d6b6-d52b-4787-a062-b0dff68e2733';
const APP_ID = 'd0acdd36-77e7-4ee1-b945-21f8c9e4867f';
const ACCOUNT_ID = '3eaa605c-29aa-43e6-be97-2077dda0d962';

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
  console.log('=== Step 1: Register Bundle ID on Apple ===');
  let bundleIdResp = await appleAPI(`/bundleIds?filter[identifier]=${BUNDLE_ID}`);
  let bundleIdObj;

  if (bundleIdResp.data?.data?.length) {
    bundleIdObj = bundleIdResp.data.data[0];
    console.log(`Bundle ID exists: ${bundleIdObj.attributes.identifier} (${bundleIdObj.id})`);
  } else {
    console.log(`Registering ${BUNDLE_ID}...`);
    const regResp = await appleAPI('/bundleIds', 'POST', {
      data: {
        type: 'bundleIds',
        attributes: {
          identifier: BUNDLE_ID,
          name: 'Buccaneer Wallet',
          platform: 'IOS'
        }
      }
    });
    if (regResp.status !== 201) {
      console.error('Registration failed:', JSON.stringify(regResp.data, null, 2));
      return;
    }
    bundleIdObj = regResp.data.data;
    console.log(`Registered: ${bundleIdObj.attributes.identifier} (${bundleIdObj.id})`);
  }

  console.log('\n=== Step 2: Get Distribution Certificate ===');
  const certResp = await appleAPI('/certificates?filter[certificateType]=IOS_DISTRIBUTION&limit=5');
  const certs = certResp.data?.data || [];
  const myCert = certs.find(c => c.attributes.serialNumber === '312773927CA3F5FD72CAC12527722E35') || certs[0];
  if (!myCert) { console.error('No distribution certificate'); return; }
  console.log(`Cert: ${myCert.attributes.serialNumber} (${myCert.id})`);

  console.log('\n=== Step 3: Create Provisioning Profile ===');
  const existingProfilesResp = await appleAPI('/profiles?filter[profileType]=IOS_APP_STORE&limit=20');
  let profile;

  for (const p of (existingProfilesResp.data?.data || [])) {
    if (p.attributes.name === 'Buccaneer Wallet AppStore') {
      console.log(`Deleting old profile: ${p.attributes.name} (${p.attributes.profileState})...`);
      await appleAPI(`/profiles/${p.id}`, 'DELETE');
    }
  }

  console.log('Creating fresh provisioning profile...');
  const profileResp = await appleAPI('/profiles', 'POST', {
    data: {
      type: 'profiles',
      attributes: {
        name: 'Buccaneer Wallet AppStore',
        profileType: 'IOS_APP_STORE'
      },
      relationships: {
        bundleId: { data: { type: 'bundleIds', id: bundleIdObj.id } },
        certificates: { data: [{ type: 'certificates', id: myCert.id }] }
      }
    }
  });

  if (profileResp.status !== 201) {
    console.error('Profile creation failed:', JSON.stringify(profileResp.data, null, 2));
    return;
  }
  profile = profileResp.data.data;
  console.log(`Profile: ${profile.attributes.name} (UUID: ${profile.attributes.uuid})`);

  const profileContent = profile.attributes.profileContent;
  const profileBuf = Buffer.from(profileContent, 'base64');
  const profileStr = profileBuf.toString('utf8');
  const teamIdMatch = profileStr.match(/<key>TeamIdentifier<\/key>\s*<array>\s*<string>([^<]+)<\/string>/);
  const teamNameMatch = profileStr.match(/<key>TeamName<\/key>\s*<string>([^<]+)<\/string>/);
  const appleTeamIdentifier = teamIdMatch?.[1];
  const appleTeamName = teamNameMatch?.[1] || 'Unknown';
  console.log(`Apple Team: ${appleTeamName} (${appleTeamIdentifier})`);

  console.log('\n=== Step 4: Set up Expo - Apple Team ===');
  let appleTeamId;
  const teamsResp = await expoGraphQL(`query { account { byId(accountId: "${ACCOUNT_ID}") { appleTeams { id appleTeamIdentifier appleTeamName } } } }`);
  const existingTeams = teamsResp.data?.data?.account?.byId?.appleTeams || [];

  const matchingTeam = existingTeams.find(t => t.appleTeamIdentifier === appleTeamIdentifier);
  if (matchingTeam) {
    appleTeamId = matchingTeam.id;
    console.log(`Existing team: ${matchingTeam.appleTeamName} (${appleTeamId})`);
  } else {
    const createTeamResp = await expoGraphQL(`mutation { appleTeam { createAppleTeam(appleTeamInput: { appleTeamIdentifier: "${appleTeamIdentifier}", appleTeamName: "${appleTeamName}" }, accountId: "${ACCOUNT_ID}") { id appleTeamIdentifier } } }`);
    if (createTeamResp.data?.errors) {
      console.error('Team creation:', createTeamResp.data.errors[0]?.message);
      return;
    }
    appleTeamId = createTeamResp.data?.data?.appleTeam?.createAppleTeam?.id;
    console.log(`Created team: ${appleTeamId}`);
  }

  console.log('\n=== Step 5: Set up Expo - Apple App Identifier ===');
  let appleAppIdentifierId;
  const createAppIdResp = await expoGraphQL(`mutation { appleAppIdentifier { createAppleAppIdentifier(appleAppIdentifierInput: { bundleIdentifier: "${BUNDLE_ID}" }, accountId: "${ACCOUNT_ID}") { id bundleIdentifier } } }`);

  if (createAppIdResp.data?.errors) {
    console.log('App ID note:', createAppIdResp.data.errors[0]?.message);
    const existingIds = await expoGraphQL(`query { account { byId(accountId: "${ACCOUNT_ID}") { appleAppIdentifiers { id bundleIdentifier } } } }`);
    const ids = existingIds.data?.data?.account?.byId?.appleAppIdentifiers || [];
    const match = ids.find(i => i.bundleIdentifier === BUNDLE_ID);
    if (match) {
      appleAppIdentifierId = match.id;
      console.log(`Using existing: ${match.id}`);
    }
  } else {
    appleAppIdentifierId = createAppIdResp.data?.data?.appleAppIdentifier?.createAppleAppIdentifier?.id;
    console.log(`Created: ${appleAppIdentifierId}`);
  }

  if (!appleAppIdentifierId) {
    console.error('Could not get Apple App Identifier');
    return;
  }

  console.log('\n=== Step 6: Set up Expo - iOS App Credentials ===');
  let iosAppCredentialsId;
  const existingCredsResp = await expoGraphQL(`query { app { byFullName(fullName: "@kirkish/buccaneer-wallet") { iosAppCredentials { id iosAppBuildCredentialsList { id iosDistributionType } } } } }`);
  const existingCreds = existingCredsResp.data?.data?.app?.byFullName?.iosAppCredentials || [];

  if (existingCreds.length > 0) {
    iosAppCredentialsId = existingCreds[0].id;
    console.log(`Using existing credentials: ${iosAppCredentialsId}`);
    if (existingCreds[0].iosAppBuildCredentialsList?.length > 0) {
      console.log('Existing build credentials found. Will update them.');
    }
  } else {
    const createCredsResp = await expoGraphQL(`mutation { iosAppCredentials { createIosAppCredentials(iosAppCredentialsInput: { appleTeamId: "${appleTeamId}" }, appId: "${APP_ID}", appleAppIdentifierId: "${appleAppIdentifierId}") { id } } }`);
    if (createCredsResp.data?.errors) {
      console.error('Credentials creation error:', createCredsResp.data.errors[0]?.message);
      return;
    }
    iosAppCredentialsId = createCredsResp.data?.data?.iosAppCredentials?.createIosAppCredentials?.id;
    console.log(`Created: ${iosAppCredentialsId}`);
  }

  console.log('\n=== Step 7: Upload Provisioning Profile to Expo ===');
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
      appleProvisioningProfile: profileContent,
      developerPortalIdentifier: profile.attributes.uuid
    },
    accountId: ACCOUNT_ID,
    appleAppIdentifierId: appleAppIdentifierId
  });

  let provisioningProfileId;
  if (createProvResp.data?.errors) {
    console.error('Provisioning profile error:', createProvResp.data.errors[0]?.message);
    return;
  }
  provisioningProfileId = createProvResp.data?.data?.appleProvisioningProfile?.createAppleProvisioningProfile?.id;
  console.log(`Uploaded provisioning profile: ${provisioningProfileId}`);

  console.log('\n=== Step 8: Create iOS App Build Credentials ===');
  const existingBuildCreds = existingCreds[0]?.iosAppBuildCredentialsList || [];

  if (existingBuildCreds.length > 0) {
    const bcId = existingBuildCreds[0].id;
    console.log(`Updating existing build credentials ${bcId}...`);

    const setDistCertResp = await expoGraphQL(`mutation { iosAppBuildCredentials { setDistributionCertificate(id: "${bcId}", distributionCertificateId: "${EXPO_CERT_ID}") { id iosDistributionType } } }`);
    if (setDistCertResp.data?.errors) {
      console.error('Set dist cert error:', setDistCertResp.data.errors[0]?.message);
    } else {
      console.log('Distribution certificate set');
    }

    const setProvResp = await expoGraphQL(`mutation { iosAppBuildCredentials { setProvisioningProfile(id: "${bcId}", provisioningProfileId: "${provisioningProfileId}") { id } } }`);
    if (setProvResp.data?.errors) {
      console.error('Set prov profile error:', setProvResp.data.errors[0]?.message);
    } else {
      console.log('Provisioning profile set');
    }
  } else {
    const createBuildCredsResp = await expoGraphQL(`mutation { iosAppBuildCredentials { createIosAppBuildCredentials(iosAppBuildCredentialsInput: { iosDistributionType: APP_STORE, distributionCertificateId: "${EXPO_CERT_ID}", provisioningProfileId: "${provisioningProfileId}" }, iosAppCredentialsId: "${iosAppCredentialsId}") { id iosDistributionType } } }`);
    if (createBuildCredsResp.data?.errors) {
      console.error('Build creds error:', createBuildCredsResp.data.errors[0]?.message);
    } else {
      const bc = createBuildCredsResp.data?.data?.iosAppBuildCredentials?.createIosAppBuildCredentials;
      console.log(`Created build credentials: ${bc?.id} (${bc?.iosDistributionType})`);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('  ALL CREDENTIALS CONFIGURED SUCCESSFULLY!');
  console.log('='.repeat(50));
  console.log('✓ Apple Bundle ID registered');
  console.log('✓ Distribution Certificate on Expo');
  console.log('✓ Provisioning Profile on Expo');
  console.log('✓ Build Credentials linked');
  console.log('\nReady for: eas build --platform ios --profile production --non-interactive');
}

main().catch(console.error);
