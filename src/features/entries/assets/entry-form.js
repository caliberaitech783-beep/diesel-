const actor=document.body.dataset.actor;
const offlineScope=document.body.dataset.offlineScope || undefined;
const form=document.querySelector('#entry-form');
const indentDue=document.querySelector('[data-indent-due]');
const indentDate=document.querySelector('[data-indent-date]');
function updateIndentDue() {
  if (!indentDue) return;
  const day=form.elements.namedItem('day').value, raw=form.elements.namedItem('requiredBy').value;
  const days=Number(raw), stamp=Date.parse(day);
  const due=raw!==''&&Number.isInteger(days)&&days>=0&&days<=3650&&Number.isFinite(stamp)
    ? new Date(stamp+days*86400000).toISOString().slice(0,10) : '';
  indentDue.textContent=due?due.split('-').reverse().join('/'):'DD/MM/YYYY';
  indentDate.min=day;
  indentDate.max=Number.isFinite(stamp)?new Date(stamp+3650*86400000).toISOString().slice(0,10):'';
  indentDate.value=due;
}
if(indentDue){
  form.addEventListener('input',event=>{if(['day','requiredBy'].includes(event.target.name))updateIndentDue();});
  indentDate.addEventListener('change',()=>{
    const day=form.elements.namedItem('day').value;
    if(indentDate.value && (indentDate.value<day || indentDate.validity.rangeOverflow)) {
      indentDate.value='';
      form.elements.namedItem('requiredBy').value='';
      updateIndentDue();
      indentDate.setCustomValidity('Choose a required date on or after the indent date, within 3650 days.');
      indentDate.reportValidity();
      return;
    }
    indentDate.setCustomValidity('');
    form.elements.namedItem('requiredBy').value=indentDate.value?Math.round((Date.parse(indentDate.value)-Date.parse(day))/86400000):'';
    updateIndentDue();
  });
  form.addEventListener('input',event=>{
    if(['day','requiredBy'].includes(event.target.name))indentDate.setCustomValidity('');
  });
  indentDate.addEventListener('click',()=>{try{indentDate.showPicker?.();}catch{/* The native control remains available. */}});
  updateIndentDue();
}
let indentEdited=false;
if(form?.dataset.type==='E1') form.addEventListener('input',event=>{if(event.target.form===form)indentEdited=true;});
const indentSiteSwitch=document.querySelector('#indent-site-switch');
const indentSiteSelect=document.querySelector('#indent-site');
indentSiteSelect?.addEventListener('change',()=>{if(indentSiteSelect.value)indentSiteSwitch.requestSubmit();});
indentSiteSwitch?.addEventListener('submit',event=>{
  if(indentEdited&&!confirm('Switch site and discard the unsaved changes to this indent?')) {
    event.preventDefault();
    indentSiteSelect.value=indentSiteSelect.dataset.previous??'';
  }
});
if(indentSiteSelect)indentSiteSelect.dataset.previous=indentSiteSelect.value;
const indentRemarks=document.querySelector('.indent-card textarea[name="remarks"]');
indentRemarks?.addEventListener('input',()=>{
  document.querySelector('#indent-remarks-count').textContent=indentRemarks.value.length+' / 2000';
});
const syncStatus=document.querySelector('#sync-status');
const offlineEntries=document.querySelector('#offline-entries');
// The menu on the left can be hidden to give the form the full width. The choice is remembered on this device.
const railToggle = document.querySelector('#rail-toggle');
if (railToggle) {
  const remembered = () => { try { return localStorage.getItem('diesel-entry-menu') === 'hidden'; } catch { return false; } };
  const apply = hidden => {
    document.body.classList.toggle('rail-hidden', hidden);
    railToggle.setAttribute('aria-pressed', String(hidden));
    railToggle.textContent = hidden ? '☰ Show menu' : '☰ Hide menu';
  };
  apply(remembered());
  railToggle.addEventListener('click', () => {
    const hidden = !document.body.classList.contains('rail-hidden');
    try { localStorage.setItem('diesel-entry-menu', hidden ? 'hidden' : 'shown'); } catch { /* The choice simply lasts for this page. */ }
    apply(hidden);
  });
}
const navigationToggle = document.querySelector('#nav-toggle');
if (navigationToggle) {
  navigationToggle.hidden = false;
  navigationToggle.addEventListener('click', () => {
    const open = navigationToggle.getAttribute('aria-expanded') === 'true';
    navigationToggle.setAttribute('aria-expanded', String(!open));
  });
}
if(form && form.dataset.rev==='0')form.dataset.id=crypto.randomUUID();
const hosted = document.body.dataset.hosted === 'true';
const offlineEnabled = (!hosted || Boolean(offlineScope)) && 'indexedDB' in window;
if(!hosted && offlineEnabled && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/entries/offline-worker.js',{scope:'/entries/'}).then(async()=>{
    await navigator.serviceWorker.ready;
    if(navigator.onLine && location.pathname.startsWith('/entries/new/') && navigator.serviceWorker.controller) await fetch(location.href);
  }).catch(()=>{});
  document.querySelectorAll('form[action="/workspace/role"]').forEach(switcher=>switcher.addEventListener('submit',()=>{
    navigator.serviceWorker.controller?.postMessage('clear-role');
  }));
}
// Field entries stamp GPS on their own when the form opens; Refresh GPS takes a new reading.
const gpsStatus=document.querySelector('#gps-status');
function capturePosition() {
  if(!navigator.geolocation) {gpsStatus.textContent='Location is unavailable on this device.';return;}
  gpsStatus.textContent='Finding your location…';
  navigator.geolocation.getCurrentPosition(({coords})=>{
    form.dataset.position=JSON.stringify({latitude:coords.latitude,longitude:coords.longitude,accuracy:Math.round(coords.accuracy)});
    gpsStatus.textContent='GPS stamped · '+coords.latitude.toFixed(5)+', '+coords.longitude.toFixed(5)+' · ±'+Math.round(coords.accuracy)+' m';
  },()=>{gpsStatus.textContent='Location was unavailable. Allow location for this site and choose Refresh GPS.';},{enableHighAccuracy:true,timeout:15000,maximumAge:60000});
}
if(gpsStatus){document.querySelector('#record-position').addEventListener('click',capturePosition);capturePosition();}
function useTag() {
  const raw=document.getElementById('tag-input').value.trim().toLowerCase();
  const matches=[];
  for(const select of form.querySelectorAll('select[name="vehicle"],select[name="bowser"],select[name="tank"]')) {
    for (const option of select.options) {
      if (option.value && (option.value.toLowerCase()===raw || option.dataset.tag?.trim().toLowerCase()===raw)) matches.push({select,option});
    }
  }
  if (matches.length===1) {
    const [{select,option}]=matches;
    select.value=option.value;
    select.dispatchEvent(new Event('change',{bubbles:true}));
    syncStatus.textContent='Tag selected · '+option.text;
  } else syncStatus.textContent=matches.length?'This tag matches multiple records. Choose the correct record.':'Unknown tag for this site.';
}
document.querySelector('#use-tag')?.addEventListener('click',useTag);
document.querySelector('#tag-input')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();useTag();}});
const database=offlineEnabled && new Promise((resolve,reject)=>{
  const request=indexedDB.open(hosted?'diesel-pulse-entry-outbox':'diesel-local-entry-outbox',1);
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
  const response=await fetch('/entries/record/'+item.id,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(item)});
  if (response.status===401) throw Error('Sign back in with the same Pulse account to sync.');
  if (response.status===403 && !response.headers.get('Content-Type')?.includes('application/json')) {
    throw Error('This account or site no longer has access to the queued entry.');
  }
  const data=await response.json();
  if(!response.ok) throw Error(data.error||'Could not save this entry.');
  return data.url;
}
let flushing = false;
function showOfflineEntries(items) {
  if (!offlineEntries) return;
  offlineEntries.hidden = !items.length;
  const list=offlineEntries.querySelector('ul');
  list.replaceChildren(...items.map(item=>{
    const row=document.createElement('li');
    row.textContent=[item.type,item.action,item.data?.vehicle||item.data?.truck,item.day].filter(Boolean).join(' · ');
    return row;
  }));
}
async function flush() {
  if(!offlineEnabled || flushing) return;
  flushing = true;
  try {
    const queued=(await outbox('getAll')).filter(r=>r.actor===actor && r.offlineScope===offlineScope).sort((a,b)=>a.queued-b.queued);
    showOfflineEntries(queued);
    for(const [index,item] of queued.entries()) {
      syncStatus.textContent=(queued.length-index)+' actions waiting to sync.';
      try { const url=await transmit(item);await outbox('delete',item.token);
        showOfflineEntries(queued.slice(index+1));
        const a=document.createElement('a');a.href=url;a.textContent='Open synced entry';syncStatus.replaceChildren(a);
      } catch(e){
        const retry=document.createElement('button');
        retry.type='button';retry.textContent='Retry sync';retry.addEventListener('click',()=>runSync());
        syncStatus.replaceChildren(item.type+' · '+item.action+' waiting to sync. '+e.message+' ',retry);
        break;
      }
    }
  } finally { flushing=false; }
}
function runSync() {
  return flush().catch(()=>{syncStatus.textContent='Offline storage is unavailable in this browser.';});
}
async function fileData(f) {
  if(f.size>5*1024*1024)throw Error('Choose files up to 5 MB each.');
  let file=f, name=f.name;
  if (['image/jpeg','image/png'].includes(f.type) && f.size>500_000 && typeof createImageBitmap==='function') {
    try {
      const {canvas}=await imageCanvas(f,1600);
      const compressed=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.85));
      if (compressed && compressed.size<f.size) {
        file=compressed;
        name=f.name.replace(/\.[^.]+$/,'')+'.jpg';
      }
    } catch { /* Keep the original photo when the device cannot decode it for compression. */ }
  }
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('Cannot read this file.'));
    reader.onload=()=>resolve({name,base64:reader.result.split(',')[1]});reader.readAsDataURL(file);});
}
async function imageCanvas(file, maxSide) {
  if (!file || !['image/png','image/jpeg','image/webp'].includes(file.type) || file.size>5*1024*1024) {
    throw Error('Choose a PNG, JPEG or WebP photo up to 5 MB.');
  }
  const bitmap=await createImageBitmap(file);
  try {
    const scale=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));
    canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=canvas.getContext('2d',{alpha:false});
    ctx.fillStyle='#fff';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    return {canvas,ctx};
  } finally { bitmap.close(); }
}
form?.addEventListener('submit',async event=>{
  event.preventDefault();
  const status=document.querySelector('#entry-message'), action=event.submitter?.value;
  if (!action) return;
  const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
  if(status) delete status.dataset.error;
  try {
    const selectedSite=document.querySelector('select[form="indent-site-switch"]');
    if(selectedSite&&!selectedSite.value) throw Error('Select a location before saving this indent.');
    if(selectedSite&&selectedSite.value!==form.dataset.site) throw Error('Wait for the selected site to open before saving this indent.');
    const values={};
    for(const input of form.querySelectorAll('[name]')) {
      if(input.form!==form) continue;
      if(input.type==='file') {
        const saved=JSON.parse(input.dataset.saved||'[]');
        values[input.name]=input.files.length?await Promise.all([...input.files].map(fileData)):saved;
      } else values[input.name]=input.value;
    }
    const record={...values,...(selectedSite?{site:selectedSite.value}:{}),token:crypto.randomUUID(),id:form.dataset.id,actor,offlineScope,action,rev:Number(form.dataset.rev),type:form.dataset.type,data:values,device:navigator.userAgent,queued:Date.now()};
    if(form.dataset.position) record.position=JSON.parse(form.dataset.position);
    try {
      const path=await transmit(record);
      // The entry is saved, so the copy kept on this device while typing is no longer needed.
      try { localStorage.removeItem('diesel-autosave:'+form.dataset.type+':'+form.dataset.site); } catch { /* Nothing was kept. */ }
      location.assign(path);
    }
    catch(e) {
      if(!offlineEnabled||!(e instanceof TypeError)||!['Submit','Save draft','Save indent'].includes(action))throw e;
      await outbox('put',record);status.textContent='Saved on this device. Reconnect with this account, site and role to sync.';
      runSync();
    }
  }catch(e){
    // A save that did not go through must be impossible to miss.
    status.dataset.error='true';status.textContent='Not saved: '+e.message;status.scrollIntoView({block:'center'});buttons.forEach(b=>b.disabled=false);
  }
});
window.addEventListener('online',runSync);
runSync();
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
