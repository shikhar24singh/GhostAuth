import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApkServer } from '../scripts/apk-server.mjs';

test('APK downloads finish, resume accurately and reject unrelated paths', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'ghostauth-download-'));
  const file = join(folder, 'test.apk');
  const bytes = Buffer.from(Array.from({ length: 65536 }, (_, index) => index % 251));
  writeFileSync(file, bytes);
  const server = createApkServer(file);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const full = await fetch(url + '/GhostAuth-auth-preview.apk');
    assert.equal(full.status, 200);
    assert.equal(full.headers.get('connection'), 'close');
    assert.equal(full.headers.get('accept-ranges'), 'bytes');
    assert.deepEqual(Buffer.from(await full.arrayBuffer()), bytes);
    const etag = full.headers.get('etag');
    const ranges = [['bytes=0-1023', 0, 1023], ['bytes=1024-', 1024, 65535], ['bytes=-128', 65408, 65535]];
    for (const [range, start, end] of ranges) {
      const response = await fetch(url + '/GhostAuth-preview.apk', { headers: { Range: range, 'If-Range': etag } });
      assert.equal(response.status, 206);
      assert.equal(response.headers.get('content-range'), `bytes ${start}-${end}/${bytes.length}`);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes.subarray(start, end + 1));
    }
    const invalid = await fetch(url + '/GhostAuth-preview.apk', { headers: { Range: 'bytes=65536-' } });
    assert.equal(invalid.status, 416);
    assert.equal(invalid.headers.get('content-range'), 'bytes */65536');
    assert.equal((await invalid.arrayBuffer()).byteLength, 0);
    const changed = await fetch(url + '/GhostAuth-preview.apk', { headers: { Range: 'bytes=1024-', 'If-Range': '"old-build"' } });
    assert.equal(changed.status, 200);
    assert.deepEqual(Buffer.from(await changed.arrayBuffer()), bytes);
    const head = await fetch(url + '/GhostAuth-debug.apk', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), String(bytes.length));
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    assert.equal((await fetch(url + '/.git/config')).status, 404);
    const home = await fetch(url, { redirect: 'manual' });
    assert.equal(home.headers.get('location'), '/GhostAuth-auth-preview.apk');
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    unlinkSync(file);
    rmdirSync(folder);
  }
});
