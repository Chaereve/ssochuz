const assert = require('node:assert/strict');
const {page} = require('./mk');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const J=body=>Promise.resolve({ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>structuredClone(body),text:async()=>JSON.stringify(body)});
(async()=>{
 let registry={lib:[{slug:'a',title:'A',chapters:1,status:'Hoàn thành'},{slug:'b',title:'B',chapters:1,status:'Hoàn thành'},{slug:'c',title:'C',chapters:1}]};
 const writes=[];
 const p=page('admin.html',{config:{CZ_API:'https://cms.test'},fetch:(url,opt={})=>{
  const path=new URL(String(url),'https://ssochuz.pages.dev').pathname;
  if(path==='/api/health')return J({ok:true,kv:true,adminConfigured:true});
  if(path==='/api/whoami')return J({ok:true,role:'super_admin',permissions:['*']});
  if(path==='/api/registry'){
   if(opt.method==='PUT'){registry=JSON.parse(opt.body);writes.push({path,body:structuredClone(registry)});return J({ok:true});}
   return J(registry);
  }
  if(path.startsWith('/api/book/'))return J({title:'Book',chapters:[{t:'Chapter',html:'<p>Content</p>'}]});
  if(opt.method && opt.method!=='GET')writes.push({path,body:opt.body});
  return J({ok:true,items:[],comments:[],groups:[],writesToday:0});
 }});
 const {win:w,doc:d}=p;
 const input=async(el,value,event='input')=>{assert.ok(el);el.value=value;el.dispatchEvent(new w.Event(event,{bubbles:true}));await wait(40);};
 await wait(400);await input(d.querySelector('#v2Api'),'https://cms.test');await input(d.querySelector('#v2Key'),'test-key');
 d.querySelector('.v2connect').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait(700);
 assert.equal(d.querySelector('.v2gate'),null);
 d.querySelector('[data-tab="list"]').click();await wait(100);
 [...d.querySelectorAll('.v2gcard')].find(el=>el.querySelector('.v2gcard-title').textContent==='A').querySelector('button').click();await wait(450);
 await input(d.querySelector('[aria-label="Tên khác"]'),'Tên Việt\nOriginal Name');
 const group=()=>d.querySelector('[aria-label="Các phần và thứ tự đọc"]');
 await input(group().querySelector('select'),'b','change');
 await input(group().querySelector('select'),'c','change');
 assert.equal(group().querySelectorAll('li').length,3);
 await input(group().querySelector('[aria-label="Loại phần 3"]'),'special','change');
 group().querySelector('[aria-label="Đưa phần 3 lên"]').click();await wait(40);
 d.querySelector('#pane-info .sticky-actions [type="submit"]').click();await wait(400);
 assert.equal(writes.filter(x=>x.path==='/api/registry').length,1);
 assert.deepEqual(registry.lib.find(n=>n.slug==='a').aliases,['Tên Việt','Original Name']);
 assert.deepEqual(registry.lib.slice().sort((a,b)=>a.readingOrder-b.readingOrder).map(n=>[n.slug,n.partType]),[['a','main'],['c','special'],['b','extra']]);
 assert.ok(writes.every(x=>x.path==='/api/registry'),'metadata must not save chapters or enqueue push');
 // Reload editor through list: persisted values survive.
 d.querySelector('[data-tab="list"]').click();await wait(80);
 [...d.querySelectorAll('.v2gcard')].find(el=>el.querySelector('.v2gcard-title').textContent==='A').querySelector('button').click();await wait(200);
 assert.equal(d.querySelector('[aria-label="Tên khác"]').value,'Tên Việt\nOriginal Name');
 assert.equal(group().querySelectorAll('li').length,3);
 const before=JSON.stringify(registry);
 await input(d.querySelector('[aria-label="Tên khác"]'),'x'.repeat(161));
 d.querySelector('#pane-info .sticky-actions [type="submit"]').click();await wait(100);
 assert.equal(JSON.stringify(registry),before,'invalid alias must not write');
 await input(d.querySelector('[aria-label="Tên khác"]'),'');
 [...group().querySelectorAll('button')].find(b=>b.textContent.includes('Gỡ liên kết cả nhóm')).click();await wait(40);
 d.querySelector('#pane-info .sticky-actions [type="submit"]').click();await wait(150);
 assert.ok(registry.lib.every(n=>!n.readingGroup));
 assert.deepEqual(registry.lib[0].aliases,[]);
 assert.deepEqual(p.errors,[]);p.dom.window.close();
 console.log(JSON.stringify({errors0:[],checked:'admin add aliases/group, reorder/type, one registry write, reopen, validation, clear'}));
})().catch(e=>{console.error(e);process.exit(1);});
