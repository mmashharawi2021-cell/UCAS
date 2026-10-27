const CACHE='ucas-bridge-shell-v1';
const SHELL=['./','./index.html','./styles.css','./js/app.js','./js/store.js','./js/ics.js','./assets/icon.svg','./manifest.webmanifest'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin) return;
 e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(res=>{if(res.ok&&new URL(e.request.url).pathname.match(/\.(js|css|svg|webmanifest|html)$/)) {const clone=res.clone();caches.open(CACHE).then(c=>c.put(e.request,clone));}return res;})));
});
