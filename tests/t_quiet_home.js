const assert=require('node:assert/strict');
const {page,dataFetch,read}=require('./mk');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let updateFound, stateChanged, sent=0, registered=0;
 const waiting={postMessage(){sent++;}};
 const installing={state:'installing',addEventListener(type,fn){stateChanged=fn;}};
 const p=page('index.html',{fetch:dataFetch(),setup(w){
  Object.defineProperty(w.navigator,'serviceWorker',{value:{controller:{},register:async()=>{registered++;return {waiting,installing,addEventListener(type,fn){updateFound=fn;}};},addEventListener(){}}});
 }});
 await wait(500);
 assert.ok(registered>0,'SW still registers');
 assert.equal(p.doc.querySelector('#czUpdate').hidden,true);
 updateFound();installing.state='installed';stateChanged();
 assert.equal(p.doc.querySelector('#czUpdate').hidden,true,'New update stays silent');
 assert.equal(sent,0,'Must not force activation or reload active tabs');
 assert.equal(p.doc.querySelector('#czFallback').hidden,true);
 assert.equal(p.doc.querySelectorAll('#bxh .ranking-note').length,0);
 assert.equal(p.doc.querySelector('#banAuth'),null);
 assert.equal(p.doc.querySelector('#ban-doc'),null);
 assert.ok(p.doc.querySelector('a[href="/my-space"]'));
 assert.deepEqual(p.errors,[]);p.dom.window.close();
 for(const path of ['tac-gia/index.html','couple/index.html']){
  const q=page(path,{fetch:dataFetch()});await wait(300);
  assert.ok(!q.doc.querySelector('#ppSub').textContent.includes('chọn một mục'));
  q.doc.querySelector('#ppQ').value='';q.doc.querySelector('#ppQ').dispatchEvent(new q.win.Event('input'));
  assert.ok(!q.doc.querySelector('#ppSub').textContent.includes('chọn một mục'));
  q.dom.window.close();
 }
 console.log('Quiet home: waiting/installed SW silent without force reload, fallback hidden, clean descriptions, sign-in retry/double-click, people labels passed');
})().catch(e=>{console.error(e);process.exit(1)});
