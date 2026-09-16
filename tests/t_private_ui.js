const assert = require('node:assert/strict');
const {page, dataFetch} = require('./mk');
(async () => {
 const calls = [];
 const fallback = dataFetch();
 const {win,doc,dom} = page('truyen.html', {url:'https://ssochuz.pages.dev/truyen.html?slug=private-test',config:{CZ_API:'https://cms.test'},fetch:async (url,opt={})=>{
  calls.push(String(url));
  if(String(url).includes('/api/private/')) return {ok:JSON.parse(opt.body).password==='correct',json:async()=>JSON.parse(opt.body).password==='correct'?{title:'Test private',chapters:[{t:'Chapter one',html:'<p>Secret story</p>'}]}:{error:'Sai mật khẩu'}};
  return fallback(url,opt);
 }});
 await new Promise(r=>setTimeout(r,300));
 assert.ok(doc.querySelector('#unlockBook'));
 assert.ok(!calls.some(u=>u.includes('/data/book/private-')||u.includes('/api/book/private-')));
 doc.querySelector('#bookPassword').value='wrong';
 await doc.querySelector('#unlockBook').onsubmit({preventDefault(){}});
 assert.equal(doc.querySelector('#unlockMessage').textContent,'Sai mật khẩu');
 doc.querySelector('#bookPassword').value='correct';
 await doc.querySelector('#unlockBook').onsubmit({preventDefault(){}});
 await new Promise(r=>setTimeout(r,150));
 assert.equal(doc.querySelector('#unlockBook'),null);
 assert.notEqual(doc.querySelector('#chapSec').style.display,'none');
 assert.ok(doc.querySelector('#chapGrid').textContent.includes('Chapter one'));
 assert.ok(!Object.values(win.localStorage).some(v=>String(v).includes('Secret story')));
 dom.window.close(); console.log('Private UI unlock, retry, visible chapters, no public fallback passed');
})().catch(e=>{console.error(e);process.exit(1)});
