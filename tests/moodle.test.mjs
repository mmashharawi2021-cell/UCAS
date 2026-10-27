import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanMoodlePaste} from '../js/moodle.js';

test('normalizes pasted lecture text locally',()=>{
 assert.equal(cleanMoodlePaste('  محاضرة قواعد البيانات\r\nشرح محتوى المحاضرة  '),'محاضرة قواعد البيانات\nشرح محتوى المحاضرة');
});
test('rejects empty and oversized Moodle paste',()=>{
 assert.throws(()=>cleanMoodlePaste('قصير'));
 assert.throws(()=>cleanMoodlePaste('a'.repeat(120001)));
});
test('Moodle source is valid plain text; not a login fetch',()=>{
 const text='درس محاضرة عن نظم المعلومات الجغرافية وطرق جمع البيانات';
 assert.equal(cleanMoodlePaste(text),text);
});

import {safeMoodleActivityURL,parseMoodleCourseHTML} from '../js/moodle.js';

test('only authorized UCAS Moodle activity links are retained, never session tokens',()=>{
 assert.equal(safeMoodleActivityURL('https://moodle.ucas.edu.ps/mod/resource/view.php?id=123&sesskey=secret&token=oops#x'),'https://moodle.ucas.edu.ps/mod/resource/view.php?id=123');
 assert.equal(safeMoodleActivityURL('/mod/assign/view.php?id=99'), 'https://moodle.ucas.edu.ps/mod/assign/view.php?id=99');
 for(const url of ['https://evil.test/mod/assign/view.php?id=1','https://moodle.ucas.edu.ps/login/index.php','javascript:alert(1)','/webservice/rest/server.php?wstoken=secret','https://moodle.ucas.edu.ps/pluginfile.php/22/foo.pdf','https://moodle.ucas.edu.ps/mod/assign/view.php?id=abc']) assert.equal(safeMoodleActivityURL(url),null);
});
test('Moodle HTML importer rejects malformed exports',()=>{
 assert.throws(()=>parseMoodleCourseHTML('<html><body>unrelated</body></html>'));
 assert.throws(()=>parseMoodleCourseHTML('x'.repeat(4*1024*1024+1)));
});
