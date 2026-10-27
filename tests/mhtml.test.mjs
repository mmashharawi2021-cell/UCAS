import test from 'node:test';
import assert from 'node:assert/strict';
import {extractMoodleHTMLFromMHTML} from '../js/mhtml.js';
import {readMoodleCourseFile} from '../js/moodle.js';

const html='<html><body id="page-course-view-topics"><div class="course-content"><div class="activity"><a href="https://moodle.ucas.edu.ps/mod/assign/view.php?id=15&sesskey=secret" class="aalink">المحاضرة الأولى</a></div></div></body></html>';
function fixture(transfer='base64',snapshot='https://moodle.ucas.edu.ps/course/view.php?id=12'){
 const raw=transfer==='base64'?Buffer.from(html).toString('base64'):[...Buffer.from(html)].map(b=>b>=33&&b<=126&&b!==61?String.fromCharCode(b):'='+b.toString(16).padStart(2,'0').toUpperCase()).join('');
 return 'From: <Saved by Blink>\r\nSnapshot-Content-Location: '+snapshot+'\r\nMIME-Version: 1.0\r\nContent-Type: multipart/related; boundary="----UCASBound"\r\n\r\n------UCASBound\r\nContent-Type: image/png\r\nContent-Transfer-Encoding: base64\r\n\r\naGVsbG8=\r\n------UCASBound\r\nContent-Type: text/html; charset="utf-8"\r\nContent-Transfer-Encoding: '+transfer+'\r\nContent-Location: https://moodle.ucas.edu.ps/course/view.php?id=12\r\n\r\n'+raw+'\r\n------UCASBound--\r\n';
}
test('Chrome MHT with base64 extracts its HTML only',()=>assert.equal(extractMoodleHTMLFromMHTML(fixture()),html));
test('quoted-printable MHT keeps Arabic UTF-8',()=>assert.equal(extractMoodleHTMLFromMHTML(fixture('quoted-printable')),html));
test('rejects external snapshot origins',()=>assert.throws(()=>extractMoodleHTMLFromMHTML(fixture('base64','https://evil.example/')),/غير Moodle/));
test('rejects non-MHT documents',()=>assert.throws(()=>extractMoodleHTMLFromMHTML('not an MHT archive'),/غير صالح/));
test('file importer validates supported extensions and size',async()=>{
 await assert.rejects(readMoodleCourseFile({name:'page.pdf',size:1,text:async()=>''}),/الأنواع المقبولة/);
 await assert.rejects(readMoodleCourseFile({name:'page.mht',size:26*1024*1024,text:async()=>''}),/25 MB/);
});
