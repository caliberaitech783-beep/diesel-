const cacheName='local-diesel-entry-forms-v1';
const offlinePage=()=>new Response('<!doctype html><html lang="en"><meta charset="utf-8"><title>Diesel offline</title><h1>Offline</h1><p>Reopen a previously visited new-entry form on this device, or reconnect to see the register.</p></html>',{headers:{'content-type':'text/html; charset=utf-8'}});
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(cacheName);
  await cache.addAll(['/entries/assets/entry-form.js','/entries/assets/entry-language.js','/entries/assets/field-states.js','/entries/assets/purchase-order.css','/entries/assets/purchase-order-form.js','/entries/assets/purchase-order-totals.js','/entries/assets/entries.css','/theme/assets/theme.css','/theme/assets/theme.js','/masters/assets/pulse.png']);
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
  if(event.data==='clear-role')event.waitUntil(caches.delete(cacheName));
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  const form=/^\/entries\/new\/E(?:5|6|10[ABC]|11|12|14|15|16)$/.test(url.pathname);
  const asset=/^\/(?:entries\/assets\/|theme\/assets\/|masters\/assets\/pulse\.png$)/.test(url.pathname);
  if(!form&&!asset)return;
  event.respondWith((async()=>{
    const cache=await caches.open(cacheName);
    try {
      const response=await fetch(event.request);
      if(response.ok) await cache.put(event.request,response.clone());
      else if(form)await cache.delete(event.request);
      return response;
    } catch { return (await cache.match(event.request))??(form?offlinePage():Response.error()); }
  })());
});
