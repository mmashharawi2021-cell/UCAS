import test from 'node:test';
import assert from 'node:assert/strict';
import {readPDFWithOCR,ocrTextQuality} from '../js/ocr.js';
import {extractReviewCards,extractPassageCards,searchStudySources} from '../js/study.js';

test('OCR quality allows readable bilingual text, rejects scrambled Arabic',()=>{
 assert.equal(ocrTextQuality('Remote sensing uses satellite sensors for observing the Earth.').usable,true);
 assert.equal(ocrTextQuality('الاستشعار عن بعد يساعد في تحليل صور الأقمار الصناعية والبيانات المكانية.').usable,true);
 assert.equal(ocrTextQuality(Array(10).fill('ح ر و ف ع ر ب ي ة').join(' ')).usable,false);
});
test('OCR reads only first three local PDF pages and always releases worker and PDF',async()=>{
 const previous=globalThis.document;
 let rendered=0,closed=0,terminated=0,recognized=0;
 const canvas={width:0,height:0,getContext:()=>({})};
 globalThis.document={createElement:()=>canvas};
 const loader=async()=>({getDocument:({data})=>{
  assert.ok(data instanceof Uint8Array);
  return {promise:Promise.resolve({numPages:9,getPage:async n=>({
   getViewport:({scale})=>({width:600*scale,height:800*scale}),
   render:()=>({promise:Promise.resolve().then(()=>{rendered++;})}),
   cleanup:()=>{closed++}
  }),destroy:async()=>{closed++;}}),destroy:async()=>{}};
 }});
 const ocrWorker=async()=>({recognize:async()=>({data:{text:'Satellite remote sensing analysis and geospatial image classification of land cover.'}}),terminate:async()=>{terminated++;}});
 try{
  const result=await readPDFWithOCR(new Blob(['%PDF-1.4 stubbed image pages']),{pdfLoader:loader,ocrWorker});
  assert.equal(rendered,3);
  assert.equal(terminated,1);
  assert.equal(result.pages.length,3);
  assert.deepEqual(result.pages.map(x=>x.page),[1,2,3]);
  assert.equal(result.needsReview,true);
  assert.equal(result.truncated,true);
  const doc={id:'ocr1',name:'summary.pdf',module:'محاضرة',text:result.text,pages:result.pages,needsReview:true};
  assert.equal(extractReviewCards([doc]).length,0,'unverified OCR must never create definitive quiz answers');
  assert.ok(extractPassageCards([doc])[0].needsReview);
  assert.ok(searchStudySources('satellite',[doc])[0].needsReview);
 }finally{globalThis.document=previous;}
});
test('oversized PDF fails before worker initialization',async()=>{
 await assert.rejects(readPDFWithOCR({size:35*1024*1024+1,arrayBuffer:async()=>new ArrayBuffer(0)}),/35 MB/);
});
