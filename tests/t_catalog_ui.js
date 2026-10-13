const assert = require('node:assert/strict');
const {page,dataFetch} = require('./mk');
const wait = ms => new Promise(r => setTimeout(r,ms));
const J = body => Promise.resolve({ok:true,status:200,json:async()=>structuredClone(body),text:async()=>JSON.stringify(body)});
const registry = {lib:[
 {slug:'catalog-a',title:'Catalog A',aliases:['Bí Mật <img src=x onerror=alert(1)>','Original Film'],chapters:2,status:'Hoàn thành',readingGroup:'g',readingOrder:1,partType:'main'},
 {slug:'catalog-b',title:'Catalog B',chapters:1,status:'Hoàn thành',readingGroup:'g',readingOrder:3,partType:'extra'},
 {slug:'catalog-hidden',title:'SECRET DRAFT',chapters:1,pubStatus:'draft',readingGroup:'g',readingOrder:2,partType:'special'},
 {slug:'catalog-old',title:'Legacy Book',chapters:1,status:'Hoàn thành'}
]};
const chapters=[{t:'Chương 1',html:'<p>First chapter.</p>'},{t:'Chương 2',html:'<p>Last chapter.</p>'}];
const fetcher = dataFetch({api:(path)=>{
 if(path==='/api/registry') return J(registry);
 if(path==='/api/stats') return J({ok:true,items:{}});
 if(path.endsWith('/toc')) return J({title:'Catalog A',slug:path.split('/')[3],total:2,chapters:chapters.map(c=>({t:c.t}))});
 if(path.includes('/chapter/')) {const index=+path.split('/').pop();return J({index,chapter:chapters[index-1]});}
 if(/^\/api\/book\/[^/]+$/.test(path)) return J({title:'Catalog A',chapters});
}});
const setup = w => {
 w.supabase = {createClient: () => ({auth: {
  getSession: async () => ({data: {session: null}}),
  onAuthStateChange: () => ({data: {subscription: {unsubscribe() {}}}})
 }})};
};
(async()=>{
 const home=page('index.html',{config:{CZ_API:'https://cms.test'},fetch:fetcher,setup});await wait(600);
 const q=home.doc.querySelector('#q');q.value='bi mat';q.dispatchEvent(new home.win.Event('input',{bubbles:true}));await wait(250);
 assert.equal(home.doc.querySelectorAll('#grid .card').length,1);
 assert.match(home.doc.querySelector('#grid .alias-match').textContent,/Bí Mật/);
 assert.equal(home.doc.querySelector('#grid .alias-match img'),null,'alias HTML escaped');
 home.doc.querySelector('[data-view="list"]').click();await wait(30);
 assert.match(home.doc.querySelector('#grid .alias-match').textContent,/Bí Mật/);
 // Quick search uses same alias matching and displays which name matched.
 home.doc.dispatchEvent(new home.win.KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true}));await wait(60);
 const jump=home.doc.querySelector('#czJumpInput');assert.ok(jump);jump.value='Original Film';jump.dispatchEvent(new home.win.Event('input',{bubbles:true}));await wait(220);
 assert.match(home.doc.querySelector('#czJumpRes').textContent,/Tên khác khớp: Original Film/);
 assert.deepEqual(home.errors,[]);home.dom.window.close();
 for(const [slug,ch] of [['catalog-a',1],['catalog-a',2],['catalog-old',2],['catalog-b',2]]){
  const p=page('truyen.html',{url:`https://ssochuz.pages.dev/truyen/${slug}/chuong-${ch}/`,config:{CZ_API:'https://cms.test'},fetch:fetcher,setup});await wait(800);
  if(slug==='catalog-a'){
   const group=p.doc.querySelector('.reading-group');assert.ok(group);
   assert.equal(group.querySelectorAll('a').length,2);assert.doesNotMatch(group.textContent,/SECRET DRAFT/);
   assert.equal(group.querySelector('[aria-current="page"]').getAttribute('href'),'/truyen/catalog-a/');
   assert.equal(p.doc.querySelectorAll('.next-reading-part').length,ch===2?1:0);
   if(ch===2)assert.equal(p.doc.querySelector('.next-reading-part a').getAttribute('href'),'/truyen/catalog-b/');
  } else {
   assert.equal(p.doc.querySelector('.next-reading-part'),null,'last/ungrouped book has no next part');
   if(slug==='catalog-old'){assert.equal(p.doc.querySelector('.reading-group'),null);assert.equal(p.doc.querySelector('.story-aliases'),null);}
  }
  assert.deepEqual(p.errors,[]);p.dom.window.close();
 }
 console.log(JSON.stringify({errors0:[],checked:'grid/list/quick alias search, escaping, reading group order, hidden draft, next part at last chapter, legacy'}));
})().catch(e=>{console.error(e);process.exit(1);});
