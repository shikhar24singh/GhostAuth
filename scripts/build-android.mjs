import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tools = join(root, '.android-tools');
const windows = process.platform === 'win32';
const javaBin = windows ? 'java.exe' : 'java';
const portableJava = join(tools, 'jdk');
const javaCandidates = [process.env.JAVA_HOME,
  ...(existsSync(portableJava) ? readdirSync(portableJava).map(name => join(portableJava, name)) : [])];
const javaHome = javaCandidates.find(path => path && existsSync(join(path, 'bin', javaBin)));
const sdkHome = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, join(tools, 'sdk')]
  .find(path => path && existsSync(join(path, 'platforms', 'android-36', 'android.jar')));
if (!javaHome || !sdkHome) {
  console.error('Java 21 and Android SDK 36 are required. See android/README.md for setup.');
  process.exit(1);
}

const env = { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: sdkHome, ANDROID_SDK_ROOT: sdkHome,
  GRADLE_USER_HOME: process.env.GRADLE_USER_HOME || join(tools, 'gradle-cache'),
  ANDROID_USER_HOME: process.env.ANDROID_USER_HOME || join(tools, 'android-user') };
const args = ['assembleDebug', ':app:testDebugUnitTest', 'lintDebug', '--no-daemon', '--console=plain'];
const result = windows
  ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'gradlew.bat', ...args], { cwd: join(root, 'android'), env, stdio: 'inherit' })
  : spawnSync('./gradlew', args, { cwd: join(root, 'android'), env, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);

const apk = join(root, 'artifacts', 'GhostAuth-debug.apk');
mkdirSync(dirname(apk), { recursive: true });
copyFileSync(join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'), apk);
const hash = createHash('sha256').update(readFileSync(apk)).digest('hex');
writeFileSync(apk + '.sha256', `${hash}  GhostAuth-debug.apk\n`);
console.log(`\nInstallable test APK: ${apk}\nSHA-256: ${hash}`);
