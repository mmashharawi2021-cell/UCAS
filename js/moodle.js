import {extractMoodleHTMLFromMHTML,MAX_MHTML} from './mhtml.js';
export {extractMoodleHTMLFromMHTML} from './mhtml.js';
// Student-owned Moodle exports only. Runs offline in the browser; no login, cookies or tokens.
const UCAS = 'moodle.ucas.edu.ps';
const MAX_HTML = 4 * 1024 * 1024;

export function cleanMoodlePaste(input){
 if(typeof input!=='string')throw new TypeError('يجب لصق نص المحاضرة');
 const text=input.replace(/\r\n?/g,'\n').replace(/\u0000/g,'').trim();
 if(text.length<20)throw new Error('النص قصير جدًا؛ الصق 20 حرفًا على الأقل من محتوى المحاضرة');
 if(text.length>120000)throw new Error('النص طويل جدًا؛ لا تتجاوز 120 ألف حرف');
 return text;
}

// Never retain any credentials, session IDs, download URLs with signed parameters, or fragments.
// Moodle activity IDs are public identifiers; they are the only permitted query values.
export function safeMoodleActivityURL(href){
 if(typeof href!=='string'||!href.trim())return null;
 try{
  const u=new URL(href,'https://'+UCAS+'/');
  if(u.protocol!=='https:'||u.hostname!==UCAS||u.username||u.password||u.port)return null;
  if(!/^\/(?:mod\/[a-z][a-z0-9_]*\/view\.php|course\/view\.php)$/i.test(u.pathname))return null;
  const id=u.searchParams.get('id');
  if(!id||!/^\d{1,12}$/.test(id))return null;
  return `${u.origin}${u.pathname}?id=${id}`;
 }catch{return null;}
}

const normalize = x => (x||'').replace(/[\u200b\u200c\u200e\u200f]/g,'').replace(/\s+/g,' ').trim();
function findText(el,selectors){
 for(const selector of selectors){const txt=normalize(el.querySelector(selector)?.textContent||'');if(txt)return txt;}
 return '';
}
function summarize(raw,max=220){return normalize(raw).slice(0,max);}

/**
 * Read the HTML file intentionally saved by the student from their own Moodle course.
 * DOMParser is inert, and its DOM is never attached to the page. Only short, plain-text
 * course/section/activity labels and allowlisted UCAS activity links are returned.
 * Raw HTML (which can contain session keys or personal details) is discarded.
 */
export function parseMoodleCourseHTML(source,options={}){
 if(typeof source!=='string'||source.length<80||source.length>MAX_HTML)throw new Error('ملف HTML غير صالح أو كبير جدًا (الحد 4 MB)');
 if(typeof DOMParser==='undefined')throw new Error('يتطلب استيراد HTML متصفحًا حديثًا');
 const doc=new DOMParser().parseFromString(source,'text/html');
 const root=doc.body;
 const pageId=root?.id||'';
 const marker=[doc.querySelector('meta[name="generator"]')?.content||'',pageId,root?.className||''].join(' ');
 // Some Chrome Android snapshots omit Moodle theme classes, even for valid courses.
 const layout=root?.querySelector('.course-content, .course-section, .section.main, .activity, li.activity, #region-main, [data-region="course-content"]');
 const anchors=[...(root?.querySelectorAll('a[href]')||[])].filter(a=>
  !a.closest('.nav-drawer,.drawer,.courseindex,.block,.navbar,.activity-navigation,header,footer') &&
  Boolean(safeMoodleActivityURL(a.getAttribute('href'))?.includes('/mod/'))).slice(0,450);
 const hasCourseSnapshot=Boolean(options.sourceCourseUrl && safeMoodleActivityURL(options.sourceCourseUrl)?.includes('/course/view.php'));
 const moodlePage=/moodle|page-course-view|pagelayout-course|course-\d+/i.test(marker) ||
  Boolean(doc.querySelector('meta[name="generator"][content*="Moodle"], base[href^="https://moodle.ucas.edu.ps/"], link[rel="canonical"][href^="https://moodle.ucas.edu.ps/"]'));
 if(/page-login|pagelayout-login|page-my-index/i.test(marker) || doc.querySelector('form#login, input[name="password"][type="password"]')){
  throw new Error('الملف المحفوظ يُظهر صفحة تسجيل الدخول أو لوحة الطالب، وليس محتوى المساق. افتح المساق نفسه بعد تسجيل الدخول، ثم احفظ الصفحة مجددًا بصيغة MHT.');
 }
 if(!hasCourseSnapshot && !moodlePage && !anchors.length){
  throw new Error('لم نتمكن من التأكد أن الملف لصفحة مساق Moodle UCAS. افتح صفحة المساق نفسها واحفظها، أو أرسل لنا رسالة الخطأ.');
 }
 if(!layout && !anchors.length){
  throw new Error('تعرفنا على Moodle ولكن لم تظهر أنشطة المساق في النسخة المحفوظة. افتح المساق وانتظر تحميل الوحدات ثم أعد الحفظ.');
 }
 const externalHosts=[...doc.querySelectorAll('base[href],link[rel="canonical"][href]')]
  .map(el=>{try{return new URL(el.getAttribute('href')).hostname}catch{return ''}}).filter(Boolean);
 if(externalHosts.some(host=>host!==UCAS))throw new Error('الملف صادر عن موقع غير Moodle UCAS');
 const courseTitle=summarize(findText(doc,['#page-header .page-header-headings h1','.page-header-headings h1','#page-header h1','main h1','h1']) || doc.title?.split(/\s[|–-]\s/)[0] || 'مساق Moodle',150);
 const activities=[...root.querySelectorAll('li.activity, .activity-item, [data-activityname], li.modtype_resource, li.modtype_page, li.modtype_assign, div.activity')];
 const sections = new Set();
 const resources=[];const seen=new Set();
 const summaries=[];
 // Extract section summaries only when they are explicit course section descriptions.
 for(const section of [...root.querySelectorAll('.course-content > ul > li.section, li.section.main, section.course-section, .course-section, [data-for="section"]')].slice(0,45)){
  const label=summarize(findText(section,['.sectionname','.section-header .sectionname','[data-for="section_title"]','h3.sectionname','h3'])||'مصادر المساق',140);
  sections.add(label);
  const summary=section.querySelector('.summary .no-overflow,.section-summary .no-overflow,.section-summary .content');
  if(summary){const text=normalize(summary.textContent).slice(0,3000);if(text.length>=30){summaries.push({kind:'summary',title:`ملاحظات ${label}`,module:label,text});}}
 }
 for(const el of activities.slice(0,450)){
  if(el.closest('.nav-drawer,.drawer,.courseindex,.block,.navbar,.activity-navigation'))continue;
  const sec=el.closest('li.section,section.course-section,.course-section,.section.main');
  const module=summarize(sec?findText(sec,['.sectionname','.section-header .sectionname','[data-for="section_title"]','h3.sectionname','h3']):'',140)||'مصادر المساق';
  sections.add(module);
  const anchor=el.querySelector('.activityname a,.activityinstance a.aalink,.activityname a.aalink,a.aalink,a[href*="/mod/"]');
  if(!anchor)continue;
  const title=summarize(findText(el,['.activityname','.instancename','.activity-instance .activityname','[data-activityname]'])||anchor.textContent,180).replace(/\s*\b(?:File|Page|Assignment|Forum|Quiz|URL)\s*$/i,'').trim();
  if(!title)continue;
  const href=safeMoodleActivityURL(anchor.getAttribute('href'));
  const key=`${module}\u0000${title}\u0000${href||''}`;
  if(seen.has(key))continue;
  seen.add(key);
  if(href)resources.push({kind:'link',title,module,url:href});
  else resources.push({kind:'note',title,module,text:`عنوان النشاط من صفحة المساق: ${title}. افتح Moodle للاطلاع على التفاصيل والملفات.`});
  if(resources.length>=200)break;
 }
 // Older and mobile Moodle themes sometimes render activity links without .activity wrappers.
 for(const a of anchors){
  if(resources.length>=200)break;
  const href=safeMoodleActivityURL(a.getAttribute('href'));
  if(!href || resources.some(r=>r.kind==='link'&&r.url===href))continue;
  const title=summarize(a.getAttribute('aria-label')||a.textContent||a.getAttribute('title')||'',180);
  if(title.length<3)continue;
  const sec=a.closest('li.section,section.course-section,.course-section,.section.main,[data-for="section"]');
  const module=summarize(sec?findText(sec,['.sectionname','.section-title','.section-header .sectionname','[data-for="section_title"]','h3','h2']):'',140)||'مصادر المساق';
  sections.add(module);
  resources.push({kind:'link',title,module,url:href});
 }
 if(!resources.length&&!summaries.length)throw new Error('لم نجد أنشطة قابلة للاستيراد. تأكد من أنك حفظت صفحة المساق بعد ظهور المحاضرات، وليس الرئيسية أو صفحة الدخول.');
 return {courseTitle,sections:[...sections].slice(0,45),resources:[...resources,...summaries].slice(0,220),activityCount:resources.length,summaryCount:summaries.length};
}


// Chrome Android saves course pages as .mht or .mhtml. The archive never leaves the browser.
export async function readMoodleCourseFile(file){
 if(!file||typeof file.name!=="string"||typeof file.text!=="function")throw new Error("اختر ملف صفحة Moodle");
 const isMHT=/\.mht(?:ml)?$/i.test(file.name);
 if(!isMHT&&!/\.html?$/i.test(file.name))throw new Error("الأنواع المقبولة HTML وMHT وMHTML فقط");
 if(file.size>(isMHT?MAX_MHTML:4*1024*1024))throw new Error(isMHT?"ملف MHT يتجاوز 25 MB":"ملف HTML يتجاوز 4 MB");
 const source=await file.text();
 // A Chrome MHT snapshot records the original course URL in its MIME header.
 // Only the allowlisted course id is used to recognize alternate Moodle layouts.
 const snapshot=isMHT ? /^snapshot-content-location:[ \t]*(https:\/\/[^\s]+)/im.exec(source.slice(0,8192))?.[1] : null;
 const sourceCourseUrl=snapshot && safeMoodleActivityURL(snapshot)?.includes('/course/view.php') ? snapshot : null;
 return parseMoodleCourseHTML(isMHT?extractMoodleHTMLFromMHTML(source):source,{sourceCourseUrl});
}
