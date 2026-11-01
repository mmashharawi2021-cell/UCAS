import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32, readZip, zipBlobs } from '../js/lib/zip.js';

test('crc32 matches the standard check value', async () => {
  assert.equal(await crc32(new Blob(['123456789'])), 0xcbf43926);
  assert.equal(await crc32(new Blob([])), 0);
});

test('zip round trip keeps names, bytes and checksums', async () => {
  const binary = new Uint8Array(300_000).map((_, i) => (i * 31) % 256);
  const zip = await zipBlobs([
    { name: 'backup.json', blob: new Blob(['{"ok":true}']) },
    { name: 'files/1', blob: new Blob([binary]) },
    { name: 'files/2', blob: new Blob([]) },
  ]);
  assert.equal(zip.type, 'application/zip');
  const entries = await readZip(zip);
  assert.deepEqual(
    entries.map(e => [e.name, e.size]),
    [
      ['backup.json', 11],
      ['files/1', 300_000],
      ['files/2', 0],
    ],
  );
  assert.equal(await entries[0].blob.text(), '{"ok":true}');
  assert.deepEqual(new Uint8Array(await entries[1].blob.arrayBuffer()), binary);
  for (const e of entries) assert.equal(await crc32(e.blob), e.crc);
});

test('corrupted entry bytes are detected by checksum', async () => {
  const zip = await zipBlobs([{ name: 'files/1', blob: new Blob(['lecture text']) }]);
  const bytes = new Uint8Array(await zip.arrayBuffer());
  bytes[30 + 'files/1'.length] ^= 0xff;
  const [entry] = await readZip(new Blob([bytes]));
  assert.notEqual(await crc32(entry.blob), entry.crc);
});

test('rejects non-zip data and compressed archives', async () => {
  await assert.rejects(readZip(new Blob(['{"format":"ucas-bridge-backup"}'])), /غير صالح/);
  const zip = new Uint8Array(
    await (await zipBlobs([{ name: 'a', blob: new Blob(['x']) }])).arrayBuffer(),
  );
  const central = zip.length - 22 - 47;
  new DataView(zip.buffer).setUint16(central + 10, 8, true); // method 8 = deflate
  await assert.rejects(readZip(new Blob([zip])), /غير مدعومة/);
});
