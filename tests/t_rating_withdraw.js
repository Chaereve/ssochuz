const assert=require('node:assert/strict');const {page,dataFetch}=require('./mk');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let mine=3,failed=false,calls=[];
 const J=(d,ok=true)=>Promise.resolve({ok,status:ok?200:503,json:async()=>d,text:async()=>JSON.stringify(d)});
 const p=page('truyen.html',{config:{CZ_API:'https://cms.test'},url:'https://ssochuz.pages.dev/truyen/third-person/',fetch:dataFetch({api:(path,opt)=>{
  if(path==='/api/rate/me')return J({ok:true,rating:mine});
  if(path==='/api/rate'){const n=JSON.parse(opt.body).rating;calls.push(n);if(failed)return J({error:'test'},false);mine=n;return J({ok:true,rating:n,ratingCount:n?1:0,ratingAvg:n});}
 }})});
 await wait(500);
 const $=s=>p.doc.querySelector(s);
 assert.equal($('[data-star="3"]').getAttribute('aria-checked'),'true');assert.equal($('#removeRating').hidden,false);
 const notices=[];p.win.CZ.toast=(msg,kind)=>notices.push({msg,kind});
 assert.equal($('#ratingValue b').textContent,'3');
 const sameStar = $('[data-star="3"]');
 $('#removeRating').click();await wait(80);assert.equal($('[data-star="3"]'),sameStar,'Rating updates must preserve DOM to avoid replay/flicker');assert.deepEqual(calls,[0]);assert.equal($('#ratingValue b').textContent,'0');assert.equal(notices.length,1);assert.equal($('#removeRating').hidden,true);assert.equal(p.doc.querySelectorAll('.stars .on').length,0);
 $('[data-star="1"]').dispatchEvent(new p.win.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));await wait(80);assert.equal(mine,2);assert.equal($('#ratingValue b').textContent,'2');assert.match(notices[1].msg,/2 trên 5/);assert.equal(notices[1].kind,'ok');
 failed=true;$('#removeRating').click();await wait(1350);assert.equal(mine,2);assert.equal($('[data-star="2"]').getAttribute('aria-checked'),'true');assert.match($('#ratingOwn').textContent,/giữ nguyên/);
 assert.equal($('#ratingValue b').textContent,'2');assert.equal(notices.length,2,'No success toast on failure');
 assert.deepEqual(p.errors,[]);p.dom.window.close();console.log('Rating: server-owned selection, withdrawal to zero, keyboard selection, failed withdrawal preserves old rating passed');
})().catch(e=>{console.error(e);process.exit(1)});
