import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateFileCatalog, MAX_COMPANION_FILE_BYTES } from '../js/companion-files.js';

const valid = {
  id: '12345678-1234-4123-8123-123456789012',
  courseId: '821',
  sourceKey: 'a'.repeat(64),
  name: 'lecture.pdf',
  module: 'الأسبوع الأول',
  courseTitle: 'GIS',
};

test('accepts only well-formed, nonduplicated file metadata', () => {
  const catalog = validateFileCatalog([
    valid,
    valid,
    { ...valid, id: '1' },
    { ...valid, id: '22222222-2222-4222-8222-222222222222', sourceKey: 'bad' },
  ]);
  assert.equal(catalog.length, 1);
  assert.deepEqual(catalog[0], valid);
  assert.throws(() => validateFileCatalog(Array(1201).fill(valid)));
});

test('transfer is capped at 35 MiB and never forwards credentials in requests', () => {
  assert.equal(MAX_COMPANION_FILE_BYTES, 35 * 1024 * 1024);
  const site = readFileSync('js/companion-files.js', 'utf8');
  assert.match(site, /crypto\.subtle\.digest\('SHA-256'/);
  assert.match(site, /sourceKey/);
  assert.doesNotMatch(site, /wstoken|sesskey|password/);
  assert.match(site, /getFile\(existing\.id\)/);
});

test('extension transfer bridge requires exact Moodle host and known file identifier', () => {
  const bridge = readFileSync('js/companion.js', 'utf8');
  assert.match(bridge, /FILE_SCAN/);
  assert.match(bridge, /FILE_CHUNK/);
  assert.match(bridge, /FILE_CLOSE/);
  assert.match(bridge, /requestId/);
});
