import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cleanMoodlePaste} from '../js/moodle.js';

test('normalizes pasted Moodle lecture text locally',()=>{
 assert.equal(cleanMoodlePaste('  محاضرة قواعد البيانات\r\nشرح محتوى المحاضرة  '),'محاضرة قواعد البيانات\nشرح محتوى المحاضرة');
});
test('rejects invalid pasted content',()=>{
 assert.throws(()=>cleanMoodlePaste('قصير'));
 assert.throws(()=>cleanMoodlePaste('x'.repeat(120001)));
});
test('Moodle page and reduced-motion controls are present',()=>{
 const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
 assert.match(app,/function moodlePage\(/);
 assert.match(app,/function moodleImportForm\(/);
 assert.match(app,/moodle\.ucas\.edu\.ps\/login\/index\.php/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/@keyframes ucas-page-in/);
});
