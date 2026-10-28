// Text-only PDF processing with pinned Mozilla PDF.js, on this device.
// The library is downloaded on first use; the PDF bytes are not uploaded.
// This is not OCR and cannot read text from scanned image-only pages.
const PDFJS_VERSION='4.10.38';
const PDFJS_BASE='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/'+PDFJS_VERSION+'/';
const MAX_PDF_BYTES=35*1024*1024;
const MAX_PAGES=45;
const MAX_TEXT_CHARS=120000;
let libraryPromise;

export async function getPdfLibrary(){
 if(!libraryPromise){
  libraryPromise=import(PDFJS_BASE+'pdf.min.mjs').then(lib=>{
   lib.GlobalWorkerOptions.workerSrc=PDFJS_BASE+'pdf.worker.min.mjs';
   return lib;
  }).catch(error=>{libraryPromise=null;throw new Error('تعذر تحميل أداة PDF.js. اتصل بالإنترنت وحاول مجددًا: '+String(error?.message||error));});
 }
 return libraryPromise;
}
export function normalizePageItems(items){
 const rows=[];
 let current='';
 for(const item of items||[]){
  const str=String(item?.str||'');
  if(str.trim())current+=str;
  if(item?.hasEOL && current.trim()){rows.push(current.trim());current='';}
  else if(str && !item?.hasEOL)current+=' ';
 }
 if(current.trim())rows.push(current.trim());
 return rows.join('\n').replace(/[ \t]{2,}/g,' ').trim();
}
export async function extractPdfText(file,{maxPages=MAX_PAGES,maxChars=MAX_TEXT_CHARS,loader=getPdfLibrary}={}){
 if(!file||typeof file.arrayBuffer!=='function')throw new Error('ملف PDF غير صالح');
 if(file.size>MAX_PDF_BYTES)throw new Error('حجم PDF يتجاوز الحد 35 MB');
 if(file.size<10)throw new Error('ملف PDF فارغ أو تالف');
 const lib=await loader();
 // Never pass a URL to PDF.js: only raw bytes from a user-selected file.
 const data=new Uint8Array(await file.arrayBuffer());
 const task=lib.getDocument({data,isEvalSupported:false,disableFontFace:true,useSystemFonts:true});
 let document;
 try{
  document=await task.promise;
  const totalPages=document.numPages;
  const pages=[];
  const limit=Math.min(totalPages,maxPages);
  let length=0;
  for(let n=1;n<=limit;n++){
   const page=await document.getPage(n);
   const content=await page.getTextContent();
   const text=normalizePageItems(content.items);
   page.cleanup();
   if(text.trim()){
    const remaining=maxChars-length;
    if(remaining<=0)break;
    const clipped=text.slice(0,remaining);
    pages.push({page:n,text:clipped});
    length+=clipped.length;
   }
  }
  if(!pages.length)throw new Error('ملف PDF لا يحتوي على نص قابل للاستخراج. قد يكون عبارة عن صور ممسوحة ضوئيًا ويتطلب OCR.');
  return {
   text:pages.map(x=>x.text).join('\n'),
   pages,
   totalPages,
   pagesExamined:limit,
   truncated:totalPages>limit||length>=maxChars
  };
 }catch(error){
  if(/لا يحتوي على نص/.test(String(error?.message)))throw error;
  throw new Error('تعذر استخراج نص PDF: '+String(error?.message||error));
 }finally{
  if(document)await document.destroy();
  else await task.destroy();
 }
}
