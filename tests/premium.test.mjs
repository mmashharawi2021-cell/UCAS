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
