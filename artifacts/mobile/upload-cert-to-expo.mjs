import https from 'https';
import fs from 'fs';
import crypto from 'crypto';

const EXPO_TOKEN = process.env.EXPO_TOKEN;
const ASC_KEY_ID = '459TANN95N';
const ASC_ISSUER_ID = 'e94ce994-3806-429b-ad7e-a1d10cf2e842';
const ASC_KEY_PATH = '/home/runner/workspace/artifacts/mobile/AuthKey_459TANN95N.p8';
const BUNDLE_ID = 'com.buccaneer.wallet';

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

async function main() {
  const p12Path = '/home/runner/workspace/artifacts/mobile/expo_dist.p12';
  const p12Data = fs.readFileSync(p12Path);
  const p12Base64 = p12Data.toString('base64');
  console.log(`P12 file: ${p12Data.length} bytes`);

  const accountResp = await expoGraphQL(`query { viewer { id accounts { id name } } }`);
  const account = accountResp.data.data.viewer.accounts[0];
  console.log(`Account: ${account.name} (${account.id})`);

  const jwt = createAppleJWT();
  const certList = await apiRequest('api.appstoreconnect.apple.com', '/v1/certificates?filter[certificateType]=IOS_DISTRIBUTION&limit=5', 'GET', null, jwt);
  const certs = certList.data.data || [];
  const newCert = certs.find(c => c.attributes.serialNumber === '312773927CA3F5FD72CAC12527722E35');
  if (newCert) {
    console.log(`Using Apple cert: ${newCert.attributes.serialNumber} (${newCert.id})`);
  }

  console.log('\nUploading Distribution Certificate to Expo...');
  const mutation = `
    mutation CreateDistCert($input: AppleDistributionCertificateInput!, $accountId: ID!) {
      appleDistributionCertificate {
        createAppleDistributionCertificate(
          appleDistributionCertificateInput: $input
          accountId: $accountId
        ) {
          id
          serialNumber
          validityNotAfter
        }
      }
    }
  `;

  const uploadResp = await expoGraphQL(mutation, {
    input: {
      certP12: p12Base64,
      certPassword: 'expo',
      developerPortalIdentifier: newCert ? newCert.id : undefined,
    },
    accountId: account.id
  });

  if (uploadResp.data?.errors) {
    console.error('Upload error:', JSON.stringify(uploadResp.data.errors, null, 2));
    return;
  }

  const expoCert = uploadResp.data?.data?.appleDistributionCertificate?.createAppleDistributionCertificate;
  if (!expoCert) {
    console.error('Unexpected response:', JSON.stringify(uploadResp.data, null, 2));
    return;
  }

  console.log(`SUCCESS! Expo cert ID: ${expoCert.id}`);
  console.log(`Serial: ${expoCert.serialNumber}`);
  console.log(`Valid until: ${expoCert.validityNotAfter}`);

  console.log('\nNow setting up the app credentials and provisioning profile...');

  const appQuery = `
    query {
      app {
        byFullName(fullName: "@kirkish/buccaneer-wallet") {
          id
          slug
        }
      }
    }
  `;
  const appResp = await expoGraphQL(appQuery);
  const app = appResp.data?.data?.app?.byFullName;
  if (!app) {
    console.error('App not found:', JSON.stringify(appResp.data));
    return;
  }
  console.log(`App: ${app.slug} (${app.id})`);

  const getCredentialsQuery = `
    query {
      __type(name: "IosAppCredentialsMutation") {
        fields {
          name
          args {
            name
            type {
              name kind
              ofType {
                name kind
                inputFields {
                  name
                  type { name kind ofType { name } }
                }
              }
            }
          }
        }
      }
    }
  `;

  const credSchemaResp = await expoGraphQL(getCredentialsQuery);
  const credFields = credSchemaResp.data?.data?.__type?.fields || [];
  for (const f of credFields) {
    console.log(`\n  ${f.name}:`);
    for (const a of f.args) {
      const t = a.type?.ofType || a.type;
      console.log(`    ${a.name}: ${t?.name || a.type?.kind}`);
      if (t?.inputFields) {
        for (const inp of t.inputFields) {
          console.log(`      ${inp.name}: ${inp.type?.ofType?.name || inp.type?.name}`);
        }
      }
    }
  }

  const buildCredSchemaQuery = `
    query {
      __type(name: "IosAppBuildCredentialsMutation") {
        fields {
          name
          args {
            name
            type {
              name kind
              ofType {
                name kind
                inputFields {
                  name
                  type { name kind ofType { name } }
                }
              }
            }
          }
        }
      }
    }
  `;
  const buildCredSchema = await expoGraphQL(buildCredSchemaQuery);
  const buildCredFields = buildCredSchema.data?.data?.__type?.fields || [];
  console.log('\nBuild credentials mutations:');
  for (const f of buildCredFields) {
    console.log(`\n  ${f.name}:`);
    for (const a of f.args) {
      const t = a.type?.ofType || a.type;
      console.log(`    ${a.name}: ${t?.name || a.type?.kind}`);
      if (t?.inputFields) {
        for (const inp of t.inputFields) {
          console.log(`      ${inp.name}: ${inp.type?.ofType?.name || inp.type?.name}`);
        }
      }
    }
  }
}

main().catch(console.error);
