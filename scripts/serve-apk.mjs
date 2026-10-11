import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApkServer, DOWNLOAD_PATH } from './apk-server.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apk = join(root, 'artifacts', 'GhostAuth-debug.apk');
if (!existsSync(apk)) { console.error('Build the APK first with npm run android:apk.'); process.exit(1); }
const host = process.env.APK_HOST || '127.0.0.1';
const port = Number(process.env.APK_PORT || 4174);
const server = createApkServer(apk);
server.on('error', error => { console.error(error.message); process.exit(1); });
server.listen(port, host, () => console.log(`GhostAuth APK: http://${host}:${port}${DOWNLOAD_PATH}`));
