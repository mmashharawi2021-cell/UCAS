const CACHE='ucas-bridge-shell-v3';
const SHELL=['./','./index.html','./styles.css','./js/app.js','./js/store.js','./js/ics.js','./js/office.js','./js/moodle.js','./assets/icon.svg','./manifest.webmanifest'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('ucas-bridge-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
 const request=e.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 if(request.mode==='navigate'){
  e.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put('./index.html',copy));}return response;}).catch(()=>caches.match('./index.html')));
  return;
 }
 e.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{if(response.ok&&/\.(js|css|svg|webmanifest|html)$/.test(url.pathname)){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}return response;})));
});
