const actor=document.body.dataset.actor;
const form=document.querySelector('#entry-form');
const syncStatus=document.querySelector('#sync-status');
const navigationToggle = document.querySelector('#nav-toggle');
if (navigationToggle) {
  navigationToggle.hidden = false;
  navigationToggle.addEventListener('click', () => {
    const open = navigationToggle.getAttribute('aria-expanded') === 'true';
    navigationToggle.setAttribute('aria-expanded', String(!open));
  });
}
if(form && form.dataset.rev==='0')form.dataset.id=crypto.randomUUID();
const offlineEnabled = document.body.dataset.hosted !== 'true';
if(offlineEnabled && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/entries/offline-worker.js',{scope:'/entries/'}).then(async()=>{
    await navigator.serviceWorker.ready;
    if(navigator.onLine && location.pathname.startsWith('/entries/new/') && navigator.serviceWorker.controller) await fetch(location.href);
  }).catch(()=>{});
  document.querySelectorAll('form[action="/workspace/role"]').forEach(switcher=>switcher.addEventListener('submit',()=>{
    navigator.serviceWorker.controller?.postMessage('clear-role');
  }));
}
document.querySelector('#record-position')?.addEventListener('click',()=>{
  if(!navigator.geolocation) {syncStatus.textContent='Location is unavailable on this device.';return;}
  navigator.geolocation.getCurrentPosition(({coords})=>{
    form.dataset.position=JSON.stringify({latitude:coords.latitude,longitude:coords.longitude});
    syncStatus.textContent='GPS captured.';
  },()=>{syncStatus.textContent='Location was unavailable.';},{timeout:10000});
});
function useTag() {
  const raw=document.getElementById('tag-input').value.trim().toLowerCase();
  for(const select of form.querySelectorAll('select[name="vehicle"],select[name="bowser"],select[name="tank"]')) {
    const option=[...select.options].find(o=>o.value && o.value.toLowerCase()===raw);
    if(option){select.value=option.value;syncStatus.textContent='Tag selected · '+option.text;return;}
  }
  syncStatus.textContent='Unknown tag for this site.';
}
document.querySelector('#use-tag')?.addEventListener('click',useTag);
document.querySelector('#tag-input')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();useTag();}});
const database=offlineEnabled && new Promise((resolve,reject)=>{
  const request=indexedDB.open('diesel-local-entry-outbox',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('requests',{keyPath:'token'});
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});
async function outbox(method,value) {
  const db=await database;
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('requests','readwrite'), store=tx.objectStore('requests');
    const result=value===undefined?store[method]():store[method](value);
    tx.oncomplete=()=>resolve(result.result);tx.onerror=()=>reject(tx.error);
  });
}
async function transmit(item) {
  const response=await fetch('/entries/record/'+item.id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(item)});
  const data=await response.json();
  if(!response.ok) throw Error(data.error||'Could not save this entry.');
  return data.url;
}
async function flush() {
  if(!offlineEnabled) return;
  const queued=(await outbox('getAll')).filter(r=>r.actor===actor).sort((a,b)=>a.queued-b.queued);
  if(!queued.length)return;
  syncStatus.textContent=queued.length+' local action(s) waiting to sync.';
  for(const item of queued) {
    try { const url=await transmit(item);await outbox('delete',item.token);
      const a=document.createElement('a');a.href=url;a.textContent='Open synced entry';syncStatus.replaceChildren(a);
    } catch(e){syncStatus.textContent='Waiting to sync · '+e.message;break;}
  }
}
async function fileData(f) {
  if(f.size>5*1024*1024)throw Error('Choose files up to 5 MB each.');
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('Cannot read this file.'));
    reader.onload=()=>resolve({name:f.name,base64:reader.result.split(',')[1]});reader.readAsDataURL(f);});
}
form?.addEventListener('submit',async event=>{
  event.preventDefault();
  const status=document.querySelector('#entry-message'), action=event.submitter.value;
  const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
  try {
    const values={};
    for(const input of form.querySelectorAll('[name]')) {
      if(input.type==='file') {
        const saved=JSON.parse(input.dataset.saved||'[]');
        values[input.name]=input.files.length?await Promise.all([...input.files].map(fileData)):saved;
      } else values[input.name]=input.value;
    }
    const record={...values,token:crypto.randomUUID(),id:form.dataset.id,actor,action,rev:Number(form.dataset.rev),type:form.dataset.type,data:values,device:navigator.userAgent,queued:Date.now()};
    if(form.dataset.position) record.position=JSON.parse(form.dataset.position);
    try { const path=await transmit(record);location.assign(path); }
    catch(e) {
      if(!offlineEnabled||!(e instanceof TypeError)||!['Submit','Save draft'].includes(action))throw e;
      await outbox('put',record);status.textContent='Saved on this device. Reconnect to sync.';
    }
  }catch(e){status.textContent=e.message;buttons.forEach(b=>b.disabled=false);}
});
window.addEventListener('online',()=>flush().catch(e=>syncStatus.textContent=e.message));
flush().catch(()=>{syncStatus.textContent='Offline storage is unavailable in this browser.';});
for(const [id,step] of [['request-otp','request'],['confirm-otp','confirm']]) {
  document.getElementById(id)?.addEventListener('click',async()=>{
    const output=document.querySelector('#sms-code');
    try {
      const response=await fetch('/entries/approval/'+form.dataset.id+'/'+step,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:document.querySelector('#otp').value})});
      const data=await response.json();if(!response.ok)throw Error(data.error);
      if(data.url)location.assign(data.url);else output.textContent='Local SMS preview · '+data.code+' (5 minutes)';
    }catch(e){output.textContent=e.message;}
  });
}
