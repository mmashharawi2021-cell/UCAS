import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(resolve(root, p), 'utf8');

test('complete, internal static assets', () => {
  for (const p of [
    'index.html',
    'styles.css',
    'js/app.js',
    'js/study.js',
    'js/store.js',
    'js/ics.js',
    'sw.js',
    'manifest.webmanifest',
    'assets/icon.svg',
    'README.md',
  ])
    assert.ok(existsSync(resolve(root, p)), p);
  const html = read('index.html');
  assert.match(html, /<html lang="ar" dir="rtl"/);
  assert.match(html, /script type="module" src="js\/app\.js(?:\?v=[0-9.]+)?"/);
  assert.match(html, /Content-Security-Policy/);
});
test('no hardcoded credentials or network AI calls', () => {
  const source = read('js/app.js') + read('js/store.js');
  assert.doesNotMatch(source, /sk-[A-Za-z0-9_-]{16}/);
  assert.doesNotMatch(source, /api\.openai\.com/);
  assert.doesNotMatch(source, /moodle\.ucas\.edu\.ps\/login\/index\.php\?username/);
  assert.match(source, /indexedDB/);
});
test('includes all agreed initial workflows in UI source', () => {
  const source = read('js/app.js');
  for (const keyword of [
    'مركز الاستيراد',
    'التكليفات والتقويم',
    'الاختبارات التدريبية',
    'التقدم الدراسي',
    'المساعد الذكي',
    'Google Drive',
    'ICS',
    'PDF',
  ])
    assert.ok(source.includes(keyword), keyword);
});
