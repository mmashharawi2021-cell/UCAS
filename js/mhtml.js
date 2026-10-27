// Chrome MHT/MHTML parser: extracts only HTML locally; never persists raw MIME.
const UCAS="moodle.ucas.edu.ps",MAX_HTML=4*1024*1024;
export const MAX_MHTML=25*1024*1024;
function split(part){const m=/\r?\n\r?\n/.exec(part);return m?[part.slice(0,m.index),part.slice(m.index+m[0].length)]:null;}
function headers(raw){const out=new Map();for(const line of raw.replace(/\r?\n[ \t]+/g," ").split(/\r?\n/)){const i=line.indexOf(":");if(i>0)out.set(line.slice(0,i).trim().toLowerCase(),line.slice(i+1).trim());}return out;}
function checkURL(s){if(!s||!/^https?:\/\//i.test(s.trim()))return;try{const u=new URL(s.trim());if(u.protocol!=="https:"||u.hostname!==UCAS||u.username||u.password||u.port)throw Error();}catch{throw new Error("ملف MHT محفوظ من موقع غير Moodle UCAS");}}
function decode(body,encoding,charset){
 const kind=(encoding||"8bit").trim().toLowerCase();
 if(["8bit","7bit","binary"].includes(kind)){if(body.length>MAX_HTML)throw new Error("صفحة HTML داخل MHT كبيرة جدًا");return body;}
 let bytes;
 if(kind==="base64"){
  const raw=body.replace(/\s/g,"");
  if(!/^[a-z0-9+/]*={0,2}$/i.test(raw)||raw.length%4===1)throw new Error("ترميز Base64 غير صالح");
  if(raw.length>Math.ceil(MAX_HTML*4/3)+8)throw new Error("صفحة HTML داخل MHT كبيرة جدًا");
  bytes=Uint8Array.from(atob(raw),c=>c.charCodeAt(0));
 }else if(kind==="quoted-printable"){
  const raw=body.replace(/=\r?\n/g,""),buf=[];
  for(let i=0;i<raw.length;i++){
   if(raw[i]==="="&&/^[a-f\d]{2}$/i.test(raw.slice(i+1,i+3))){buf.push(parseInt(raw.slice(i+1,i+3),16));i+=2;continue;}
   const n=raw.codePointAt(i);
   if(n<=127)buf.push(n);else{buf.push(...new TextEncoder().encode(String.fromCodePoint(n)));if(n>65535)i++;}
   if(buf.length>MAX_HTML*2)throw new Error("صفحة HTML داخل MHT كبيرة جدًا");
  }
  bytes=new Uint8Array(buf);
 }else throw new Error("ترميز MHT غير مدعوم");
 if(bytes.length>MAX_HTML)throw new Error("صفحة HTML داخل MHT كبيرة جدًا");
 try{return new TextDecoder(charset||"utf-8").decode(bytes);}catch{return new TextDecoder("utf-8").decode(bytes);}
}
export function extractMoodleHTMLFromMHTML(raw){
 if(typeof raw!=="string"||raw.length<100||raw.length>MAX_MHTML)throw new Error("ملف MHT غير صالح أو كبير جدًا (25 MB)");
 const top=split(raw);if(!top)throw new Error("ملف MHT ليس أرشيف MIME صالحًا");
 const head=headers(top[0]),type=head.get("content-type")||"";
 if(!/^multipart\/(?:related|mixed)\s*(?:;|$)/i.test(type))throw new Error("لم يتم العثور على أرشيف صفحات MHT");
 checkURL(head.get("snapshot-content-location"));
 const boundary=/boundary\s*=\s*(?:"([^"]+)"|'([^']+)'|([^;\s]+))/i.exec(type)?.slice(1).find(Boolean);
 if(!boundary||boundary.length>150||/[\r\n]/.test(boundary))throw new Error("حدود ملف MHT غير صحيحة");
 const delimiter="--"+boundary;
 const escaped=delimiter.replace(/[.*+?^$()|[\]{}]/g,"\\$&");
 const parts=top[1].split(new RegExp("(?:^|\\r?\\n)"+escaped+"(?=--|\\r?\\n)","g"));
 if(parts.length<2||parts.length>500)throw new Error("تعذر العثور على أجزاء صفحة MHT");
 for(const piece of parts.slice(1)){
  if(piece.startsWith("--"))break;
  const pair=split(piece.replace(/^\r?\n/,""));if(!pair)continue;
  const h=headers(pair[0]),pt=h.get("content-type")||"";
  if(!/^text\/html(?:\s*;|\s*$)/i.test(pt))continue;
  checkURL(h.get("content-location"));
  const charset=/charset\s*=\s*(?:"([^"]+)"|'([^']+)'|([^;\s]+))/i.exec(pt)?.slice(1).find(Boolean)||"utf-8";
  const html=decode(pair[1].replace(/\r?\n$/,""),h.get("content-transfer-encoding"),charset);
  if(html.length>MAX_HTML)throw new Error("صفحة HTML داخل MHT كبيرة جدًا");
  return html;
 }
 throw new Error("لم يُعثر على صفحة HTML داخل ملف MHT. احفظ صفحة المساق المفتوحة.");
}
