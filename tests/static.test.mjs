import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
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
test('release version is the same everywhere', () => {
  const version = JSON.parse(read('package.json')).version;
  assert.match(read('sw.js'), new RegExp(`const VERSION = '${version.replace(/\./g, '\\.')}'`));
  assert.match(
    read('js/app.js'),
    new RegExp(`const APP_VERSION = '${version.replace(/\./g, '\\.')}'`),
  );
  const html = read('index.html');
  assert.ok(html.includes(`styles.css?v=${version}`), 'index.html styles version');
  assert.ok(html.includes(`js/app.js?v=${version}`), 'index.html app version');
});
test('installable PWA icons are present', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  const sizes = manifest.icons.map(i => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
  assert.ok(manifest.icons.some(i => i.purpose === 'maskable'));
  for (const icon of manifest.icons) assert.ok(existsSync(resolve(root, icon.src)), icon.src);
  assert.match(read('index.html'), /rel="apple-touch-icon"/);
});
test('service worker caches every app module', () => {
  const sw = read('sw.js');
  const walk = dir =>
    readdirSync(resolve(root, dir), { withFileTypes: true }).flatMap(e =>
      e.isDirectory()
        ? walk(`${dir}/${e.name}`)
        : e.name.endsWith('.js')
          ? [`${dir}/${e.name}`]
          : [],
    );
  for (const file of walk('js'))
    assert.ok(sw.includes(`./${file}`), `${file} missing from SHELL in sw.js`);
});
