import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = path => readFileSync(resolve(process.cwd(), path), 'utf8');

test('premium dashboard renders real local indicators', () => {
  const source = read('js/app.js');
  assert.match(source, /function premiumOverview\(\)/);
  assert.match(source, /state\.exams/);
  assert.match(source, /state\.resources/);
  assert.match(source, /premium-focus-title/);
  assert.match(source, /role="progressbar"/);
});

test('AI requests require consent per selected lecture', () => {
  const source = read('js/features/ai.js');
  assert.match(source, /if \(!s\.consent\)/);
  assert.match(source, /data-act-change="ai-consent"/);
  assert.match(source, /s\.consent = false;/);
  assert.match(read('tests/personal-browser.mjs'), /without consent/);
});

test('privacy disclosures describe optional Supabase and Gemini', () => {
  const app = read('js/app.js');
  assert.doesNotMatch(app, /لا يوجد تسجيل دخول ولا جمع بيانات مستخدم/);
  assert.match(app, /Gemini/);
  assert.match(app, /Supabase/);
  assert.doesNotMatch(read('README.md'), /No AI provider integration/);
});

test('Premium Studio 2.0 uses accessible course filtering and AI workspace', () => {
  const app = read('js/app.js');
  const ai = read('js/features/ai.js');
  const html = read('index.html');
  const sw = read('sw.js');
  assert.match(app, /id="premium-hero-title"/);
  assert.match(app, /id="course-filter"/);
  assert.match(app, /data-course-searchable/);
  assert.match(app, /addEventListener\('input'/);
  assert.match(ai, /ai-studio-layout/);
  assert.match(ai, /ai-cloud-consent/);
  assert.match(ai, /ai-starter-grid/);
  assert.match(html, /premium-v2\.css\?v=1\.4\.0/);
  assert.match(sw, /premium-v2\.css/);
});

test('mobile UX preserves data and provides an expandable, accessible dashboard', () => {
  const app = read('js/app.js');
  const html = read('index.html');
  const sw = read('sw.js');
  const css = read('mobile-ux.css');
  assert.match(app, /class="premium-home-extras"/);
  assert.match(app, /data-action="close-menu"/);
  assert.match(app, /class="mobile-menu-close"/);
  assert.match(html, /mobile-ux\.css\?v=1\.4\.0/);
  assert.match(sw, /mobile-ux\.css/);
  assert.match(css, /premium-course-card:nth-child\(n \+ 3\)/);
  assert.match(css, /\.sidebar \.nav-group/);
  assert.match(css, /\.mobile-nav/);
});
