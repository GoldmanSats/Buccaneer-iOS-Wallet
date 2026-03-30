import { spawn } from 'child_process';
import { createInterface } from 'readline';

const env = {
  ...process.env,
  EXPO_TOKEN: "EQuTvNqRfH_h6Mqr1yBMCXwLC1DesWdXhcOfuYQB",
  EXPO_APPLE_APP_STORE_CONNECT_API_KEY_KEY_ID: "459TANN95N",
  EXPO_APPLE_APP_STORE_CONNECT_API_KEY_ISSUER_ID: "e94ce994-3806-429b-ad7e-a1d10cf2e842",
  EXPO_APPLE_APP_STORE_CONNECT_API_KEY_PATH: "/home/runner/workspace/artifacts/mobile/AuthKey_459TANN95N.p8",
  EAS_BUILD_NO_EXPO_GO_WARNING: "true",
  FORCE_COLOR: "0",
};

const child = spawn('eas', ['build', '--platform', 'ios', '--profile', 'production', '--no-wait'], {
  cwd: '/home/runner/workspace/artifacts/mobile',
  env,
  stdio: ['pipe', 'pipe', 'pipe'],
});

let output = '';

child.stdout.on('data', (data) => {
  const text = data.toString();
  output += text;
  process.stdout.write(text);

  if (text.toLowerCase().includes('log in') || text.includes('?')) {
    setTimeout(() => {
      child.stdin.write('Y\n');
    }, 500);
  }
});

child.stderr.on('data', (data) => {
  const text = data.toString();
  output += text;
  process.stderr.write(text);
});

child.on('close', (code) => {
  console.log(`\nProcess exited with code ${code}`);
});
