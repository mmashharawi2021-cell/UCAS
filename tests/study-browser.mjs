import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8099/',{waitUntil:'domcontentloaded'});
 await page.waitForSelector('.topbar');
 await page.evaluate(async()=>{
  const {put}=await import('./js/store.js');
  const text='الرقابة: متابعة سير العمل ومقارنة النتائج مع خطة المشروع المعتمدة.\nالتقييم: قياس مدى تحقق أهداف المشروع والنتائج الفعلية على الأرض.\nالاستشعار عن بعد: جمع معلومات عن سطح الأرض دون تلامس مباشر.\nالمفتاح الأساسي: حقل يستخدم لتعريف كل سجل في جدول البيانات بصورة فريدة.\nالفهرس المكاني: بنية تساعد على تسريع الاستعلامات المرتبطة بالموقع الجغرافي.\nالخريطة الرقمية: تمثيل مرئي للبيانات المكانية باستخدام برمجيات خاصة.';
  const blob=new Blob([text],{type:'text/plain'});
  await put('resources',{id:'ci-study-text',kind:'file',name:'unit-test-lecture.txt',courseId:'course-1',module:'المحاضرة الأولى',blob,size:blob.size,addedAt:new Date().toISOString(),completed:false});
 });
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForSelector('[data-course="course-1"]');
 await page.locator('[data-course="course-1"]').first().click();
 await page.waitForSelector('[data-action="assistant"]');
 await page.locator('[data-action="assistant"]').click();
 await page.waitForSelector('#study-query');
 await page.locator('#study-query').fill('الرقابة');
 await page.locator('#study-search-form button[type="submit"]').click();
 await page.waitForFunction(()=>document.querySelector('.study-match')?.textContent?.includes('الرقابة'),null,{timeout:10000});
 assert.ok((await page.locator('#study-results').innerText()).includes('unit-test-lecture.txt'));
 assert.equal(await page.locator('[data-action="study-copy"]').isDisabled(),false);
 await page.locator('[data-action="study-cards"]').click();
 await page.waitForSelector('[data-action="study-reveal"]');
 await page.locator('[data-action="study-reveal"]').first().click();
 assert.equal(await page.locator('.study-answer').first().isVisible(),true);
 await page.locator('[data-action="study-start-quiz"]').click();
 await page.waitForSelector('.quiz-panel');
 assert.ok((await page.locator('.quiz-panel').innerText()).includes('السؤال'));
 // Regression: narrative-only PDF/lecture paragraphs must produce useful, cited cards.
 await page.evaluate(async()=>{
  const {put,remove}=await import('./js/store.js');
  await remove('resources','ci-study-text');
  const paragraph='Geographical information systems store and analyze location-based information to support urban service planning and environmental impact assessments. Remote sensing observations help map land cover change using satellite imagery and classification methods.';
  const blob=new Blob([paragraph],{type:'text/plain'});
  await put('resources',{id:'ci-passage-text',kind:'file',name:'narrative-lecture.txt',courseId:'course-1',module:'الوحدة الثالثة',blob,size:blob.size,addedAt:new Date().toISOString()});
 });
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForSelector('[data-course="course-1"]');
 await page.locator('[data-course="course-1"]').first().click();
 await page.locator('[data-action="assistant"]').click();
 await page.locator('[data-action="study-cards"]').click();
 await page.waitForFunction(()=>document.querySelector('.study-match')?.textContent?.includes('narrative-lecture.txt'));
 const studyText=await page.locator('#study-results').innerText();
 assert.ok(studyText.includes('مقتطفات حرفية'),studyText);
 await page.locator('[data-action="study-reveal"]').first().click();
 assert.ok((await page.locator('.study-answer').first().innerText()).includes('Geographical information systems'));
 assert.equal(await page.locator('[data-action="study-copy"]').isDisabled(),false);
 assert.equal(errors.length,0,errors.join('\n'));
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
 assert.ok(overflow<=2,'overflow '+overflow);
 console.log('PASS: local lecture search, references, flashcards, quiz, and phone layout');
 await page.close();
} finally {await browser.close();}
