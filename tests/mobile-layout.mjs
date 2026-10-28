import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

const browserPath=process.env.CHROME_PATH||'/usr/bin/google-chrome';
const browser=await chromium.launch({headless:true,executablePath:browserPath,args:['--no-sandbox']});
try {
 for(const width of [320,360,390,430,768]){
  const page=await browser.newPage({viewport:{width,height:850},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  await page.goto('http://127.0.0.1:8099/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('.topbar')&&document.querySelector('.page-stage'),null,{timeout:15000});
  await page.evaluate(()=>document.querySelector('[data-go="import"]')?.click());
  await page.waitForTimeout(500);
  const result=await page.evaluate(()=>{
   const w=window.innerWidth;
   const doc=document.documentElement;
   const nodes=[...document.querySelectorAll('.shell,.main-area,.topbar,.content,.page-stage,.page-intro,.quick-actions,.quick-action,.tabs,.panel,.drive-import,.drive-panel,.drive-hero,.drive-panel form,.drive-panel input')].filter(e=>getComputedStyle(e).display!=='none');
   const offenders=nodes.map(el=>({tag:el.tagName,cls:el.className,scroll:el.scrollWidth,client:el.clientWidth,rect:(()=>{const r=el.getBoundingClientRect();return [Math.round(r.left),Math.round(r.right)]})()})).filter(v=>v.rect[1]>w+2||v.rect[0]<-2||v.scroll>v.client+2).slice(0,18);
   return {width:w,scrollWidth:doc.scrollWidth,bodyScrollWidth:document.body.scrollWidth,offenders};
  });
  console.log(JSON.stringify(result));
  assert.ok(result.scrollWidth<=width+2,'Mobile overflow at '+width+'px: '+JSON.stringify(result));
  await page.close();
 }
} finally {await browser.close();}
