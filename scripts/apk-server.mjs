import { createServer } from 'node:http';
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const DOWNLOAD_PATH = '/GhostAuth-auth-preview.apk';
const paths = new Set([DOWNLOAD_PATH, '/GhostAuth-preview.apk', '/GhostAuth-debug.apk']);

function byteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header || '');
  // Ignore unsupported or malformed ranges, including multipart requests.
  if (!match || (!match[1] && !match[2])) return null;
  const suffix = !match[1];
  const first = Number(suffix ? match[2] : match[1]);
  const last = suffix || !match[2] ? size - 1 : Number(match[2]);
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)
    || (suffix && first === 0)) return false;
  const start = suffix ? Math.max(0, size - first) : first;
  const end = Math.min(last, size - 1);
  return start >= size || end < start ? false : { start, end };
}

export function createApkServer(apk) {
  let cached;
  return createServer((req, res) => {
    // Finish each response with an explicit connection close for download clients.
    res.setHeader('Connection', 'close');
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    if (pathname === '/') { res.writeHead(302, { Location: DOWNLOAD_PATH }); res.end(); return; }
    if (!paths.has(pathname)) { res.writeHead(404); res.end('Not found'); return; }
    let info;
    try {
      info = statSync(apk);
      if (!cached || cached.size !== info.size || cached.mtimeMs !== info.mtimeMs) {
        cached = { size: info.size, mtimeMs: info.mtimeMs,
          etag: `"${createHash('sha256').update(readFileSync(apk)).digest('hex')}"` };
      }
    } catch { res.writeHead(503); res.end('The APK is not available. Build it first.'); return; }
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', `attachment; filename="${pathname.slice(1)}"`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('ETag', cached.etag);
    res.setHeader('Last-Modified', info.mtime.toUTCString());
    res.setHeader('Cache-Control', 'no-store');
    const ifRange = req.headers['if-range'];
    const canResume = !ifRange || ifRange === cached.etag
      || (Number.isFinite(Date.parse(ifRange)) && Date.parse(ifRange) >= Math.floor(info.mtimeMs / 1000) * 1000);
    const range = req.method === 'GET' && canResume ? byteRange(req.headers.range, info.size) : null;
    if (range === false) {
      res.writeHead(416, { 'Content-Range': `bytes */${info.size}`, 'Content-Length': 0 });
      res.end(); return;
    }
    const start = range ? range.start : 0;
    const end = range ? range.end : info.size - 1;
    res.setHeader('Content-Length', end - start + 1);
    if (range) res.setHeader('Content-Range', `bytes ${start}-${end}/${info.size}`);
    res.writeHead(range ? 206 : 200);
    if (req.method === 'HEAD') { res.end(); return; }
    const stream = createReadStream(apk, { start, end });
    stream.on('error', error => res.destroy(error));
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  });
}
