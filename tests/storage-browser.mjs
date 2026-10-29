// Browser test: schema v1 → v2 migration, lazy file loading, backup/restore round-trip,
// and the data-protection UI. Run with a local server on 127.0.0.1:8099.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  // 1) Create a legacy v1 database with an inline blob before the app opens it.
  await page.goto('http://127.0.0.1:8099/sw.js');
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const del = indexedDB.deleteDatabase('ucas-academic-bridge');
      del.onsuccess = resolve;
      del.onerror = () => reject(del.error);
    });
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('ucas-academic-bridge', 1);
      req.onupgradeneeded = () => {
        for (const s of [
          'courses',
          'resources',
          'tasks',
          'events',
          'attempts',
          'progress',
          'settings',
        ])
          req.result.createObjectStore(s, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction('resources', 'readwrite');
    tx.objectStore('resources').put({
      id: 'legacy-1',
      kind: 'file',
      name: 'legacy.txt',
      courseId: 'course-1',
      module: 'م1',
      blob: new Blob(['legacy content'], { type: 'text/plain' }),
      addedAt: new Date().toISOString(),
      completed: false,
    });
    await new Promise(r => (tx.oncomplete = r));
    db.close();
  });

  // 2) Open the app: migration must move the blob out of `resources`.
  await page.goto('http://127.0.0.1:8099/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.topbar');
  const migrated = await page.evaluate(async () => {
    const store = await import('./js/store.js');
    const db = await store.openDB();
    const list = await store.all('resources');
    const full = await store.get('resources', 'legacy-1');
    const byCourse = await store.byCourse('resources', 'course-1');
    return {
      version: db.version,
      stores: [...db.objectStoreNames],
      listHasBlob: list.some(r => 'blob' in r),
      hasFile: list[0]?.hasFile,
      size: list[0]?.size,
      text: await full.blob.text(),
      byCourse: byCourse.length,
    };
  });
  assert.equal(migrated.version, 4);
  assert.ok(migrated.stores.includes('files'));
  assert.equal(migrated.listHasBlob, false, 'resource lists must not carry blobs');
  assert.equal(migrated.hasFile, true);
  assert.equal(migrated.size, 14);
  assert.equal(migrated.text, 'legacy content');
  assert.equal(migrated.byCourse, 1);

  // 3) Backup → wipe → restore keeps file contents.
  const roundTrip = await page.evaluate(async () => {
    const store = await import('./js/store.js');
    const data = await store.backup();
    const row = data.stores.resources.find(r => r.id === 'legacy-1');
    await store.replaceAll('resources', []);
    const afterWipe = await store.getFile('legacy-1');
    await store.restore(JSON.parse(JSON.stringify(data)));
    const restored = await store.get('resources', 'legacy-1');
    return {
      hasBlobData: !!row.blobData,
      noHasFileInBackup: !('hasFile' in row),
      afterWipe,
      text: await restored.blob.text(),
    };
  });
  assert.ok(roundTrip.hasBlobData);
  assert.ok(roundTrip.noHasFileInBackup);
  assert.equal(roundTrip.afterWipe, null, 'clearing resources must clear files too');
  assert.equal(roundTrip.text, 'legacy content');

  // 3b) ZIP backup (v2): byte-exact round trip, legacy JSON via the same entry point,
  // and a corrupted archive is rejected without touching existing data.
  const archive = await page.evaluate(async () => {
    const store = await import('./js/store.js');
    const bytes = new Uint8Array(3 * 1024 * 1024).map((_, i) => (i * 7) % 256);
    await store.put('resources', {
      id: 'big-1',
      kind: 'file',
      name: 'lecture.pdf',
      type: 'application/pdf',
      size: bytes.length,
      courseId: 'c1',
      blob: new Blob([bytes], { type: 'application/pdf' }),
    });
    const zip = await store.backupArchive();
    const magic = String.fromCharCode(...new Uint8Array(await zip.slice(0, 2).arrayBuffer()));
    await store.replaceAll('resources', []);
    await store.restoreFile(new File([zip], 'b.zip'));
    const big = await store.get('resources', 'big-1');
    const same = new Uint8Array(await big.blob.arrayBuffer()).every((v, i) => v === bytes[i]);
    const legacy = await store.get('resources', 'legacy-1');

    const raw = new Uint8Array(await zip.arrayBuffer());
    raw[raw.length - 200_000] ^= 0xff; // inside the last file entry
    await store.remove('resources', 'legacy-1');
    let error = '';
    try {
      await store.restoreFile(new File([raw], 'bad.zip'));
    } catch (err) {
      error = err.message;
    }
    const untouched =
      !(await store.get('resources', 'legacy-1')) && !!(await store.getFile('big-1'));

    await store.restoreFile(new File([zip], 'b.zip'));
    const json = await store.backup();
    await store.restoreFile(new File([JSON.stringify(json)], 'old.json'));
    return {
      magic,
      type: big.blob.type,
      size: big.blob.size,
      same,
      legacyText: await legacy.blob.text(),
      error,
      untouched,
      jsonRestored: !!(await store.getFile('big-1')),
    };
  });
  assert.equal(archive.magic, 'PK');
  assert.equal(archive.type, 'application/pdf');
  assert.equal(archive.size, 3 * 1024 * 1024);
  assert.ok(archive.same, 'restored file bytes must match');
  assert.equal(archive.legacyText, 'legacy content');
  assert.match(archive.error, /تالف/);
  assert.ok(archive.untouched, 'a rejected restore must not change local data');
  assert.ok(archive.jsonRestored, 'legacy JSON backups still restore');

  // 4) UI: backup reminder on home, storage panel in settings, file still opens.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.backup-reminder');
  await page.evaluate(() => document.querySelector('[data-go="settings"]').click());
  await page.waitForSelector('.storage-panel');
  const panel = await page.locator('.storage-panel').innerText();
  assert.match(panel, /المستخدم/);
  // The settings button downloads a ZIP that the restore input accepts back.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate(() => document.querySelector('[data-action="export"]').click()),
  ]);
  assert.match(download.suggestedFilename(), /^ucas-bridge-backup-\d{4}-\d{2}-\d{2}\.zip$/);
  page.once('dialog', d => d.accept());
  await page.setInputFiles('#restore-file', await download.path());
  await page.locator('.toast:not(.error)', { hasText: 'تمت استعادة النسخة' }).waitFor();
  await page.evaluate(() => document.querySelector('[data-go="settings"]')?.click());
  await page.evaluate(() => document.querySelector('[data-go="courses"]').click());
  await page.waitForSelector('[data-course="course-1"]');
  await page.locator('[data-course="course-1"]').first().click();
  await page.waitForSelector('[data-view-resource="legacy-1"]');
  await page.evaluate(() => document.querySelector('[data-view-resource="legacy-1"]').click());
  await page.waitForSelector('#text-preview');
  await page.waitForFunction(() => document.getElementById('text-preview').textContent.length > 0);
  assert.equal(await page.locator('#text-preview').innerText(), 'legacy content');

  assert.deepEqual(errors, []);
  console.log('storage-browser: ok');
} finally {
  await browser.close();
}
