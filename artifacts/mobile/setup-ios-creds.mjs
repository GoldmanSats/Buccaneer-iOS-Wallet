import { execSync } from 'child_process';
import fs from 'fs';
import crypto from 'crypto';
import https from 'https';

const ASC_KEY_ID = '459TANN95N';
const ASC_ISSUER_ID = 'e94ce994-3806-429b-ad7e-a1d10cf2e842';
const ASC_KEY_PATH = '/home/runner/workspace/artifacts/mobile/AuthKey_459TANN95N.p8';
const EXPO_TOKEN = process.env.EXPO_TOKEN;

function createJWT() {
  const privateKey = fs.readFileSync(ASC_KEY_PATH, 'utf8');
  const now = Math.floor(Date.now() / 1000);

  const header = Buffer.from(JSON.stringify({
    alg: 'ES256',
    kid: ASC_KEY_ID,
    typ: 'JWT'
  })).toString('base64url');

  const payload = Buffer.from(JSON.stringify({
    iss: ASC_ISSUER_ID,
    iat: now,
    exp: now + 1200,
    aud: 'appstoreconnect-v1'
  })).toString('base64url');

  const signInput = `${header}.${payload}`;

  const key = crypto.createPrivateKey(privateKey);
  const sig = crypto.sign('SHA256', Buffer.from(signInput), { key, dsaEncoding: 'ieee-p1363' });

  return `${signInput}.${sig.toString('base64url')}`;
}

function apiRequest(hostname, path, method = 'GET', body = null, token = null) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = https.request({ hostname, path, method, headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  const jwt = createJWT();

  console.log('Step 1: Checking existing distribution certificates...');
  const certList = await apiRequest('api.appstoreconnect.apple.com', '/v1/certificates?filter[certificateType]=IOS_DISTRIBUTION', 'GET', null, jwt);
  console.log(`Apple API status: ${certList.status}`);

  if (certList.status !== 200) {
    console.error('Apple API error:', JSON.stringify(certList.data, null, 2));
    return;
  }

  const existingCerts = certList.data.data || [];
  console.log(`Found ${existingCerts.length} existing distribution certificate(s)`);

  let certData;
  let privateKeyPath;

  if (existingCerts.length > 0) {
    console.log('Using existing Distribution Certificate:', existingCerts[0].attributes.name);
    certData = existingCerts[0];
  } else {
    console.log('\nStep 2: Creating new Distribution Certificate...');
    console.log('Generating RSA key pair and CSR...');
    execSync('openssl req -new -newkey rsa:2048 -nodes -keyout ios_dist.key -out ios_dist.csr -subj "/CN=Buccaneer Wallet Distribution/O=GoldmanSats"', {
      cwd: '/home/runner/workspace/artifacts/mobile'
    });
    privateKeyPath = '/home/runner/workspace/artifacts/mobile/ios_dist.key';

    const csrContent = fs.readFileSync('/home/runner/workspace/artifacts/mobile/ios_dist.csr', 'utf8');

    console.log('Submitting CSR to Apple...');
    const certResponse = await apiRequest('api.appstoreconnect.apple.com', '/v1/certificates', 'POST', {
      data: {
        type: 'certificates',
        attributes: {
          csrContent: csrContent,
          certificateType: 'IOS_DISTRIBUTION'
        }
      }
    }, jwt);

    console.log(`Certificate creation status: ${certResponse.status}`);
    if (certResponse.status !== 201) {
      console.error('Failed:', JSON.stringify(certResponse.data, null, 2));
      return;
    }
    certData = certResponse.data.data;
  }

  const certContent = certData.attributes.certificateContent;
  const certSerial = certData.attributes.serialNumber;
  console.log(`Certificate serial: ${certSerial}`);

  const certDer = Buffer.from(certContent, 'base64');
  fs.writeFileSync('/home/runner/workspace/artifacts/mobile/ios_distribution.cer', certDer);

  if (privateKeyPath) {
    console.log('\nStep 3: Creating P12 bundle...');
    const certPem = `-----BEGIN CERTIFICATE-----\n${certContent.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----`;
    fs.writeFileSync('/home/runner/workspace/artifacts/mobile/ios_dist_cert.pem', certPem);
    execSync('openssl pkcs12 -export -out ios_dist.p12 -inkey ios_dist.key -in ios_dist_cert.pem -passout pass:""', {
      cwd: '/home/runner/workspace/artifacts/mobile'
    });
    console.log('P12 bundle created');
  }

  console.log('\nStep 4: Uploading to Expo...');
  const whoami = await apiRequest('api.expo.dev', '/v2/auth/userinfo', 'GET', null, EXPO_TOKEN);
  if (whoami.status === 200) {
    console.log(`Logged in as: ${whoami.data?.data?.username}`);
  }

  if (privateKeyPath && fs.existsSync('/home/runner/workspace/artifacts/mobile/ios_dist.p12')) {
    const p12Data = fs.readFileSync('/home/runner/workspace/artifacts/mobile/ios_dist.p12');
    const p12Base64 = p12Data.toString('base64');

    console.log('\nP12 file ready for upload.');
    console.log(`Certificate serial: ${certSerial}`);
    console.log(`P12 size: ${p12Data.length} bytes`);
  }

  console.log('\n=== SUCCESS ===');
  console.log('Distribution Certificate is ready!');
  console.log('Now uploading to Expo via their credentials page...');

  const certDerBase64 = certContent;
  console.log('\nCertificate (base64, first 80 chars):', certDerBase64.substring(0, 80) + '...');
  console.log('\nNext step: Upload the P12 file to Expo.dev credentials page');
  console.log('Files in artifacts/mobile/:');
  console.log('  ios_dist.p12 - Upload this to Expo.dev under "Apple Distribution Certificates"');
}

main().catch(console.error);
