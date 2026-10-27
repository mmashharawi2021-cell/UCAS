import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMoodleCourseHTML, safeMoodleActivityURL} from '../js/moodle.js';

// Minimal DOM mock to reproduce mobile layouts without Moodle's desktop CSS classes.
const validHTML='<html><head><title>بناء قواعد البيانات الجغرافية</title></head><body><main><a href="/mod/resource/view.php?id=42&sesskey=DO_NOT_KEEP">المحاضرة الأولى</a></main></body></html>';
function fakePage({id='',href='/mod/resource/view.php?id=42&sesskey=DO_NOT_KEEP',login=false}={}){
 const a={textContent:'المحاضرة الأولى',getAttribute(k){return k==='href'?href:null;},closest(){return null;}};
 const root={id,className:'',querySelector(){return null;},querySelectorAll(sel){return sel==='a[href]'?[a]:[];}};
 return {body:root,title:'بناء قواعد البيانات الجغرافية',querySelector(sel){return login&&sel.includes('form#login')?{}:null;},querySelectorAll(){return [];}};
}
function withParser(doc,fn){
 const previous=globalThis.DOMParser;
 globalThis.DOMParser=class{parseFromString(){return doc;}};
 try{return fn();}finally{globalThis.DOMParser=previous;}
}
test('mobile course anchors without Moodle desktop classes are accepted',()=>{
 const data=withParser(fakePage(),()=>parseMoodleCourseHTML(validHTML,{sourceCourseUrl:'https://moodle.ucas.edu.ps/course/view.php?id=12'}));
 assert.equal(data.resources.length,1);
 assert.equal(data.resources[0].title,'المحاضرة الأولى');
 assert.equal(data.resources[0].url,'https://moodle.ucas.edu.ps/mod/resource/view.php?id=42');
 assert.ok(!JSON.stringify(data).includes('DO_NOT_KEEP'));
});
test('offsite activity links are not imported',()=>{
 assert.throws(()=>withParser(fakePage({href:'https://example.org/mod/resource/view.php?id=42'}),()=>parseMoodleCourseHTML(validHTML)),/التأكد|أنشطة/);
});
test('login snapshots report an actionable Arabic message',()=>{
 assert.throws(()=>withParser(fakePage({id:'page-login-index',login:true}),()=>parseMoodleCourseHTML(validHTML)),/تسجيل الدخول/);
});
test('existing strict UCAS URL filtering is preserved',()=>{
 assert.equal(safeMoodleActivityURL('https://moodle.ucas.edu.ps/mod/assign/view.php?id=7&sesskey=x'),'https://moodle.ucas.edu.ps/mod/assign/view.php?id=7');
});