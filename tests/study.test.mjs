import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeArabic,queryTerms,segmentText,searchStudySources,extractReviewCards,buildDefinitionQuiz,loadCourseText,formatChatGPTStudyPrompt} from '../js/study.js';

const docs=[{id:'a',name:'Lecture1.txt',module:'الوحدة الأولى',text:'إدارة المشاريع: عملية تخطيط الأنشطة والموارد بهدف تحقيق الأهداف.\nالرقابة: متابعة سير العمل ومقارنة النتائج بالخطة الأصلية.\nالتقييم: تحديد مدى تحقق أهداف المشروع ونتائجه الفعلية.\nالاستشعار عن بعد: جمع بيانات عن سطح الأرض دون تماس مباشر.\nنظم المعلومات الجغرافية: نظم لمعالجة وتحليل وتمثيل البيانات المكانية.\nقواعد البيانات: طريقة منظمة لحفظ البيانات واسترجاعها.'}];
test('normalizes Arabic orthography for useful course retrieval',()=>{
 assert.equal(normalizeArabic('إِدارة المَشاريع'),'ادارة المشاريع');
 assert.deepEqual(queryTerms('ما الفرق في إِدارة المشاريع؟'),['الفرق','اداره','المشاريع']);
 assert.ok(segmentText(docs[0].text).length>=4);
});
test('search only returns text actually present in source and explicit source names',()=>{
 const found=searchStudySources('ما هي الرقابة',docs);
 assert.ok(found.length);
 assert.equal(found[0].source,'Lecture1.txt');
 assert.ok(found[0].excerpt.includes('الرقابة'));
 assert.deepEqual(searchStudySources('مبدأ غير موجود إطلاقا',docs),[]);
});
test('definition practice questions cite imported source and use correct answer',()=>{
 const cards=extractReviewCards(docs,20);
 assert.ok(cards.length>=4);
 const quiz=buildDefinitionQuiz(cards,5);
 assert.equal(quiz.length,5);
 for(const q of quiz){
  assert.equal(q.choices.length,4);
  assert.ok(q.choices[q.answer].length>12);
  assert.ok(q.source.includes('Lecture1.txt'));
  assert.ok(q.why.includes('مراجعة'));
 }
});
test('local extraction accepts text and reports PDF as unsupported for text search',async()=>{
 const resources=[
  {id:'1',courseId:'x',kind:'file',name:'one.txt',module:'م1',blob:new Blob([docs[0].text],{type:'text/plain'})},
  {id:'2',courseId:'x',kind:'file',name:'scan.pdf',module:'م1',blob:new Blob(['%PDF'],{type:'application/pdf'})},
  {id:'3',courseId:'y',kind:'file',name:'private.txt',blob:new Blob(['other material'])}
 ];
 const result=await loadCourseText(resources,'x',async()=>{throw Error('not needed');});
 assert.equal(result.documents.length,1);
 assert.deepEqual(result.unsupported,['scan.pdf']);
 assert.ok(!JSON.stringify(result).includes('other material'));
});
test('clipboard prompt marks references and does not invent content',()=>{
 const excerpts=searchStudySources('التقييم',docs);
 const prompt=formatChatGPTStudyPrompt('إدارة المشاريع','وضح التقييم',excerpts);
 assert.ok(prompt.includes('Lecture1.txt'));
 assert.ok(prompt.includes('لا تختلق مراجع'));
 assert.ok(prompt.includes('وضح التقييم'));
});
