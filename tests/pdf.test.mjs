import test from 'node:test';
import assert from 'node:assert/strict';
import {extractPdfText,normalizePageItems} from '../js/pdf-text.js';
import {searchStudySources,loadCourseText} from '../js/study.js';

function stubPDF({text='GIS database mapping and spatial indexes',pages=1}={}){
 let destroyed=false,processed=0;
 const lib={getDocument:({data,isEvalSupported})=>{
  assert.equal(isEvalSupported,false);
  assert.ok(data instanceof Uint8Array);
  return {promise:Promise.resolve({numPages:pages,getPage:async n=>{
   processed++;
   return {getTextContent:async()=>({items:[{str:text,hasEOL:true}]}),cleanup(){}};
  },destroy:async()=>{destroyed=true;}}),destroy:async()=>{destroyed=true;}};
 }};
 return {lib,wasDestroyed:()=>destroyed,processed:()=>processed};
}
test('PDF chunks preserve text and page boundaries, and destroy resources',async()=>{
 const sample=stubPDF({pages:3});
 const file=new Blob(['%PDF-1.4 testing bytes'],{type:'application/pdf'});
 const result=await extractPdfText(file,{loader:async()=>sample.lib,maxPages:2});
 assert.equal(result.pages.length,2);
 assert.equal(result.pages[0].page,1);
 assert.equal(result.pages[1].page,2);
 assert.equal(result.totalPages,3);
 assert.equal(result.truncated,true);
 assert.equal(sample.processed(),2);
 assert.equal(sample.wasDestroyed(),true);
});
test('PDF text extraction does not accept invalid or oversized files',async()=>{
 await assert.rejects(extractPdfText(new Blob(['bad'])),/فارغ أو تالف/);
 const oversized={size:35*1024*1024+1,arrayBuffer:async()=>new ArrayBuffer(0)};
 await assert.rejects(extractPdfText(oversized),/35 MB/);
});
test('scanned PDF produces a clear OCR guidance error',async()=>{
 const file=new Blob(['%PDF some data here']);
 const lib={getDocument:()=>({promise:Promise.resolve({numPages:1,getPage:async()=>({getTextContent:async()=>({items:[]}),cleanup(){}}),destroy:async()=>{}}),destroy:async()=>{}})};
 await assert.rejects(extractPdfText(file,{loader:async()=>lib}),/OCR/);
});
test('search cites page number from PDF, while ignoring other course content',async()=>{
 const file=new Blob(['%PDF minimal PDF bytes']);
 const r=await loadCourseText([
  {courseId:'course-a',kind:'file',name:'a.pdf',id:'a',blob:file,module:'المحاضرة الأولى'},
  {courseId:'course-b',kind:'file',name:'b.txt',id:'b',blob:new Blob(['PRIVATE COURSE MATERIAL'])}
 ],'course-a',async()=>({text:''}),{pdfPreview:async()=>({text:'Spatial index speeds geographic queries.',pages:[{page:5,text:'Spatial index speeds geographic queries.'}]})});
 assert.equal(r.documents.length,1);
 assert.equal(r.documents[0].pages[0].page,5);
 const matches=searchStudySources('geographic',r.documents);
 assert.equal(matches[0].page,5);
 assert.equal(matches[0].source,'a.pdf');
 assert.ok(!JSON.stringify(r).includes('PRIVATE COURSE'));
});
test('PDF item text normalizer preserves line breaks',()=>{
 const text=normalizePageItems([{str:'Remote',hasEOL:false},{str:'Sensing',hasEOL:true},{str:'GIS',hasEOL:true}]);
 assert.equal(text,'Remote Sensing\nGIS');
});
