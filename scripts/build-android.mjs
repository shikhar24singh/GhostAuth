import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tools = join(root, '.android-tools');
const windows = process.platform === 'win32';
const flutterBin = windows ? 'flutter.bat' : 'flutter';
const javaBin = windows ? 'java.exe' : 'java';
const portableJava = join(tools, 'jdk');
const javaHome = [process.env.JAVA_HOME,
  ...(existsSync(portableJava) ? readdirSync(portableJava).map(name => join(portableJava, name)) : [])]
  .find(path => path && existsSync(join(path, 'bin', javaBin)));
const sdkHome = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, join(tools, 'sdk')]
  .find(path => path && existsSync(join(path, 'platforms', 'android-36', 'android.jar')));
const pathKey = Object.keys(process.env).find(key => key.toLowerCase() === 'path') || 'PATH';
const pathEntries = [
  process.env.FLUTTER_ROOT && join(process.env.FLUTTER_ROOT, 'bin'),
  join(tools, 'flutter', 'bin'),
  ...(process.env[pathKey] || '').split(delimiter),
].filter(Boolean);
if (!pathEntries.some(path => existsSync(join(path, flutterBin)))) {
  console.error('Install the stable Flutter SDK and add its bin directory to PATH or set FLUTTER_ROOT.');
  process.exit(1);
}
if (!javaHome || !sdkHome) {
  console.error('Java 21 and Android SDK 36 are required. See android/README.md.');
  process.exit(1);
}

const env = {
  ...process.env,
  [pathKey]: [join(javaHome, 'bin'), ...pathEntries].join(delimiter),
  JAVA_HOME: javaHome,
  PUB_CACHE: process.env.PUB_CACHE || join(tools, 'pub-cache'),
  FLUTTER_SUPPRESS_ANALYTICS: 'true',
  DART_SUPPRESS_ANALYTICS: 'true',
  ANDROID_HOME: sdkHome,
  ANDROID_SDK_ROOT: sdkHome,
  GRADLE_USER_HOME: process.env.GRADLE_USER_HOME || join(tools, 'gradle-cache'),
  ANDROID_USER_HOME: process.env.ANDROID_USER_HOME || join(tools, 'android-user'),
};

function run(executable, args, cwd = root) {
  const result = windows
    ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', executable, ...args], { cwd, env, stdio: 'inherit' })
    : spawnSync(executable, args, { cwd, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

// The Windows sdkmanager.bat shim splits Flutter's legacy semicolon-delimited NDK name.
const sdkCli = join(sdkHome, 'cmdline-tools', 'latest', 'bin', 'android.exe');
const androidProperties = readFileSync(join(root, 'android', 'gradle.properties'), 'utf8');
const ndk = androidProperties.match(/^ghostauth\.ndkVersion=(\S+)\s*$/m)?.[1];
if (windows && ndk && existsSync(sdkCli) && !existsSync(join(sdkHome, 'ndk', ndk, 'source.properties'))) {
  const result = spawnSync(sdkCli, [`--sdk=${sdkHome}`, 'sdk', 'install', `ndk/${ndk}`], { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
  if (!existsSync(join(sdkHome, 'ndk', ndk, 'source.properties'))) {
    console.error(`Android CLI did not install NDK ${ndk} into ${sdkHome}.`);
    process.exit(1);
  }
}

run(flutterBin, ['--suppress-analytics', 'build', 'apk', '--debug']);
run(flutterBin, ['--suppress-analytics', 'analyze', '--no-pub', 'lib', 'test']);
run(flutterBin, ['--suppress-analytics', 'test', '--no-pub']);

if (windows) {
  // Flutter writes drive letters without the escape required by Android lint.
  const localProperties = join(root, 'android', 'local.properties');
  const properties = readFileSync(localProperties, 'utf8');
  const escaped = properties.replace(/^((?:flutter\.sdk|sdk\.dir)=[A-Z]):(?=[\\/])/gim, '$1\\:');
  if (escaped !== properties) writeFileSync(localProperties, escaped);
}

run(windows ? 'gradlew.bat' : './gradlew',
  [':app:testDebugUnitTest', ':app:lintDebug', '--no-daemon', '--console=plain'], join(root, 'android'));

const apk = join(root, 'artifacts', 'GhostAuth-debug.apk');
mkdirSync(dirname(apk), { recursive: true });
copyFileSync(join(root, 'build', 'app', 'outputs', 'flutter-apk', 'app-debug.apk'), apk);
const hash = createHash('sha256').update(readFileSync(apk)).digest('hex');
writeFileSync(apk + '.sha256', hash + '  GhostAuth-debug.apk\n');
console.log('\nInstallable test APK: ' + apk + '\nSHA-256: ' + hash);
