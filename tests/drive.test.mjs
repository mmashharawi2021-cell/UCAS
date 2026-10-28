import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateStudyFiles,
  parseDriveReference,
  normalizeDriveTitle,
  MAX_STUDY_FILE_BYTES,
} from '../js/drive.js';

test('Drive file URLs normalize without tracking tokens or query parameters', () => {
  const id = 'A0B1C2D3E4F5G6H7I8J9';
  assert.deepEqual(
    parseDriveReference(
      'https://drive.google.com/file/d/' + id + '/view?usp=sharing&token=PRIVATE#part',
    ),
    { id, type: 'file', url: 'https://drive.google.com/file/d/' + id + '/view' },
  );
  assert.deepEqual(parseDriveReference('https://drive.google.com/open?id=' + id + '&authuser=0'), {
    id,
    type: 'file',
    url: 'https://drive.google.com/file/d/' + id + '/view',
  });
});
test('Google Docs and folders keep recognized canonical safe paths', () => {
  const id = 'A0B1C2D3E4F5G6H7I8J9';
  assert.equal(
    parseDriveReference('https://docs.google.com/document/d/' + id + '/edit?usp=sharing').url,
    'https://docs.google.com/document/d/' + id + '/edit',
  );
  assert.equal(
    parseDriveReference('https://drive.google.com/drive/folders/' + id + '?usp=sharing').url,
    'https://drive.google.com/drive/folders/' + id,
  );
  assert.equal(normalizeDriveTitle(' ', { type: 'document' }), 'مستند Google Docs');
});
test('rejects phishing origins, dangerous schemes, short IDs, and paths with credentials', () => {
  for (const url of [
    'https://drive.google.com.evil.org/file/d/ABCDEFGHIJK/view',
    'http://drive.google.com/file/d/ABCDEFGHIJK/view',
    'javascript:alert(1)',
    'https://drive.google.com/file/d/abc/view',
    'https://drive.google.com@evil.org/file/d/ABCDEFGHIJK/view',
    'https://docs.google.com/forms/d/ABCDEFGHIJK/edit',
    'https://drive.google.com/file/d/ABCDEFGHIJK/view:443',
    'https://evil.org/drive/folders/ABCDEFGHIJK',
  ])
    assert.equal(parseDriveReference(url), null, url);
});
test('limits file batches and does not accept unsupported or oversized files', () => {
  const ok = { name: 'lecture.pdf', size: 700 };
  const other = { name: 'lecture.docx', size: 1024 };
  const bad = { name: 'lecture.exe', size: 200 };
  const oversize = { name: 'big.pptx', size: MAX_STUDY_FILE_BYTES + 1 };
  const data = validateStudyFiles([ok, other, bad, oversize]);
  assert.equal(data.allowed.length, 2);
  assert.equal(data.rejected.length, 2);
  assert.throws(() => validateStudyFiles([]), /اختر ملفًا/);
  assert.throws(() => validateStudyFiles(Array(31).fill(ok)), /30/);
});
