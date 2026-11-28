import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { page } from './entry-shell.mjs';

const theme=readFileSync(new URL('../theme/assets/theme.js',import.meta.url),'utf8');
const form=readFileSync(new URL('./assets/entry-form.js',import.meta.url),'utf8');
const menu=form.slice(form.indexOf('const railToggle ='),form.indexOf('const navigationToggle ='));
const actor={id:'maker',site:'Jayant',profile:'entry-0'};
function open(active,saved='hidden',{blockedStorage=false}={}) {
  const html=page('Test',actor,active,'/entries/workspace','');
  const root={dataset:{menuDefault:html.match(/data-menu-default="([^"]+)"/)[1]}};
  const store=new Map([['diesel-menu',saved],['diesel-theme','dark']]);
  const control=()=>({hidden:false,attributes:{},events:{},addEventListener(name,handler){this.events[name]=handler;},
    setAttribute(name,value){this.attributes[name]=value;},focus(){}});
  const rail=control(),hide=control(),show=control(),mobile=control(),windowEvents={};
  const body={classList:{toggle(name,value){body[name]=value;}}};
  const elements={'.rail':rail,'#rail-toggle':hide,'#rail-show':show,'#nav-toggle':mobile};
  const document={documentElement:root,body,querySelector:selector=>elements[selector],addEventListener(){}};
  const localStorage={getItem:key=>{if(blockedStorage)throw Error('Storage blocked');return store.get(key);},
    setItem:(key,value)=>{if(blockedStorage)throw Error('Storage blocked');store.set(key,value);}};
  const context={document,localStorage,window:{addEventListener:(event,handler)=>windowEvents[event]=handler}};
  runInNewContext(theme,context);runInNewContext(menu,context);
  return {html,root,body,store,rail,hide,show,mobile,windowEvents};
}

test('Dashboard and Workspace reopen the menu despite an earlier hidden preference',()=>{
  for(const active of ['dashboard','workspace']) {
    for(const blockedStorage of [false,true]) {
      const view=open(active,'hidden',{blockedStorage});
      assert.equal(view.root.dataset.menu,'shown');
      assert.equal(view.body['rail-hidden'],false);
      assert.equal(view.show.hidden,true);
      assert.equal(view.mobile.attributes['aria-expanded'],'true');
    }
  }
});

test('workspace registers and forms start collapsed, with working Show and Hide controls',()=>{
  for(const active of ['E1','E2','E11']) {
    const view=open(active,'shown');
    assert.equal(view.root.dataset.menu,'hidden');
    assert.equal(view.mobile.attributes['aria-expanded'],'false');
    assert.equal(view.show.hidden,false);
    view.show.events.click();
    assert.equal(view.root.dataset.menu,'shown');
    assert.equal(view.mobile.attributes['aria-expanded'],'true');
    view.hide.events.click();
    assert.equal(view.root.dataset.menu,'hidden');
    assert.equal(view.body['rail-hidden'],true);
  }
});

test('menu links and browser-back restore the correct landing-page defaults',()=>{
  const view=open('workspace');
  for(const href of ['/entries/type/E1','/entries/new/E2','/master-data']) {
    view.rail.events.click({target:{closest:()=>({getAttribute:()=>href})}});
    assert.equal(view.store.get('diesel-menu'),'hidden');
  }
  for(const href of ['/entries/dashboard','/entries/workspace']) {
    view.rail.events.click({target:{closest:()=>({getAttribute:()=>href})}});
    assert.equal(view.store.get('diesel-menu'),'shown');
  }
  view.hide.events.click();
  view.windowEvents.pageshow({persisted:true});
  assert.equal(view.root.dataset.menu,'shown');
  const form=open('E1');form.show.events.click();form.windowEvents.pageshow({persisted:true});
  assert.equal(form.root.dataset.menu,'hidden');
});

test('entry menu defaults preserve the selected theme and master-page preference handling',()=>{
  assert.equal(open('dashboard').root.dataset.theme,'dark');
  const root={dataset:{}};
  runInNewContext(theme,{document:{documentElement:root,addEventListener(){}},localStorage:{getItem:key=>key==='diesel-menu'?'hidden':'dark'}});
  assert.equal(root.dataset.menu,'hidden');
  assert.equal(root.dataset.theme,'dark');
});
