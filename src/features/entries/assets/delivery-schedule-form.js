const form=document.querySelector('#entry-form[data-type="E4"]');
if(form) {
  const location=form.querySelector('[data-dispatch-location]'), open=form.querySelector('[data-dispatch-po-open]');
  const dialog=form.querySelector('#dispatch-po-list'), rows=dialog?.querySelector('[data-dispatch-po-rows]');
  const message=dialog?.querySelector('[data-dispatch-po-message]'), number=form.querySelector('[data-dispatch-po-number]');
  const po=form.elements.namedItem('po'), quantity=form.elements.namedItem('litres'), day=form.elements.namedItem('day');
  const balance=form.querySelector('[data-dispatch-balance]');
  const figure=value=>Number(value).toLocaleString('en-IN',{maximumFractionDigits:2});
  let request;
  function positionList() {
    const anchor=open.getBoundingClientRect(), box=dialog.getBoundingClientRect();
    dialog.style.left=Math.max(16,Math.min(anchor.left,innerWidth-box.width-16))+'px';
    dialog.style.top=Math.max(16,Math.min(anchor.bottom+8,innerHeight-box.height-16))+'px';
  }
  function clear() {
    po.value=''; number.value=''; quantity.value=''; quantity.removeAttribute('max'); balance.textContent='';
    po.dispatchEvent(new Event('input',{bubbles:true}));
  }
  async function showOrders() {
    if(!location.value) { location.focus(); return; }
    request?.abort(); request=new AbortController();
    rows.replaceChildren(); message.textContent='Loading purchase orders…';
    if(!dialog.open)dialog.showModal(); positionList();
    try {
      const response=await fetch('/entries/delivery-schedule/orders.json?'+new URLSearchParams({location:location.value,day:day.value,record:form.dataset.id}),
        {signal:request.signal,headers:{Accept:'application/json'}});
      if(!response.ok)throw Error('Could not load purchase orders. Close the list and try again.');
      const orders=await response.json();
      message.textContent=orders.length?'Select a purchase order.':'No purchase orders found for this location.';
      for(const order of orders) {
        const row=document.createElement('tr'), cell=document.createElement('td'), choose=document.createElement('button');
        choose.type='button'; choose.textContent=order.number; choose.disabled=!order.selectable;
        choose.title=order.reason||'Select '+order.number;
        choose.addEventListener('click',()=>{
          po.value=order.id; number.value=order.number; quantity.value=String(order.litres); quantity.max=String(order.remaining);
          balance.textContent='Available to schedule: '+figure(order.remaining)+' L';
          for(const field of [po,number,quantity]) {
            field.dispatchEvent(new Event('input',{bubbles:true})); field.dispatchEvent(new Event('change',{bubbles:true}));
          }
          dialog.close(); quantity.focus();
        });
        cell.append(choose);
        if(order.reason) { const reason=document.createElement('small'); reason.textContent=order.reason; cell.append(reason); }
        const date=document.createElement('td'), litres=document.createElement('td');
        date.textContent=order.day.split('-').reverse().join('/'); litres.textContent=figure(order.litres)+' L';
        row.append(cell,date,litres); rows.append(row);
      }
      positionList();
    } catch(error) { if(error.name!=='AbortError')message.textContent=error.message; }
  }
  if(dialog&&location) {
    open.disabled=!location.value;
    location.addEventListener('change',()=>{clear();open.disabled=!location.value;if(location.value)showOrders();});
    open.addEventListener('click',showOrders);
    dialog.querySelector('[data-dispatch-po-close]').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('close',()=>request?.abort());
    window.addEventListener('resize',()=>{if(dialog.open)positionList();});
    day.addEventListener('change',()=>{if(po.value){clear();showOrders();}});
  }
}
