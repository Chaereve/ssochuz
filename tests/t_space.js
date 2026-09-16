const assert=require('node:assert/strict');
const {page,dataFetch,read}=require('./mk');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const reg=JSON.parse(read('data/registry.json')),slug=reg.lib[0].slug;
const user={uid:'alice',name:'Alice',email:'secret@test',exp:Math.floor(Date.now()/1000)+3600};
let store={id:'a'.repeat(64),version:0,profile:{name:'Alice',bio:'',avatar:''},shelves:[]};
const J=(data,status=200)=>Promise.resolve({ok:status<400,status,json:async()=>structuredClone(data),text:async()=>JSON.stringify(data)});
const api=(path,opt={})=>{
 if(path==='/api/auth/me')return J({ok:true,user});
 if(path==='/api/me/space'){
  if(opt.method==='PUT'){const b=JSON.parse(opt.body);assert.ok(opt.headers.authorization);assert.equal(b.version,store.version);if(b.profile)store.profile=b.profile;if(b.shelf){const s={...b.shelf,id:b.shelf.id||'shelf-1'};store.shelves=store.shelves.filter(x=>x.id!==s.id).concat(s);}if(b.deleteShelf)store.shelves=store.shelves.filter(s=>s.id!==b.deleteShelf);store.version++;}
  return J(store);
 }
 if(path.startsWith('/api/profiles/'))return J({id:store.id,profile:store.profile,shelves:store.shelves.filter(s=>s.visibility==='public')});
};
(async()=>{
 const p=page('my-space.html',{config:{CZ_API:'https://cms.test'},url:'https://ssochuz.pages.dev/my-space',fetch:dataFetch({api}),setup(w){
  w.localStorage.setItem('ssochuz-user',JSON.stringify(user));w.localStorage.setItem('ssochuz-auth-token','mock-token');
  w.localStorage.setItem('ssochuz-shelf',JSON.stringify([slug]));w.localStorage.setItem('ssochuz-prog-'+slug,'2');
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 }});
 await wait(500);const $=s=>p.doc.querySelector(s);
 assert.equal($('#spaceGuest').hidden,true);assert.equal($('#cloudShelves').hidden,false);assert.equal($('#localShelf .card')!==null,true);
 assert.equal(p.doc.querySelectorAll('.space-history-row').length,1);
 $('#profileName').value='Alice <b>reader</b>';$('#profileBio').value='A quiet shelf.\n<script>bad()</script>';
 await $('#profileForm').onsubmit({preventDefault(){}});
 assert.equal(store.profile.name,'Alice <b>reader</b>');assert.equal($('#spaceHero script'),null);assert.ok($('#spaceHero').textContent.includes('<b>reader</b>'));
 $('#newShelf').click();assert.equal($('#shelfVisibility').value,'private');$('#shelfName').value='Secret shelf';
 const cb=$('#shelfPicker [data-book="'+slug+'"]');cb.checked=true;cb.dispatchEvent(new p.win.Event('change',{bubbles:true}));
 await $('#shelfForm').onsubmit({preventDefault(){}});assert.equal(store.shelves[0].visibility,'private');assert.deepEqual(store.shelves[0].books,[slug]);
 $('#shelfContent [data-edit-shelf]').click();$('#shelfVisibility').value='public';await $('#shelfForm').onsubmit({preventDefault(){}});
 const pub=page('profile.html',{config:{CZ_API:'https://cms.test'},url:'https://ssochuz.pages.dev/profile?id='+store.id,fetch:dataFetch({api})});await wait(400);
 assert.equal(pub.doc.querySelectorAll('#publicShelves .card').length,1);assert.ok(!pub.doc.body.textContent.includes('secret@test'));
 assert.equal(pub.doc.querySelector('#spaceHistory'),null);assert.equal(pub.doc.querySelector('script script'),null);
 p.win.CZ_AUTH.saveUser(null,null);await wait(20);assert.equal($('#cloudShelves').hidden,true);assert.equal($('#profileName').value,'');assert.equal($('#shelfContent').innerHTML,'');assert.ok($('#localShelf .card'),'Device list remains explicitly device-scoped');
 let attempts=0;p.win.CZ_AUTH.login=async()=>{attempts++;throw Error('test');};$('#spaceLogin').click();await wait(20);assert.equal(attempts,1);assert.match($('#spaceStatus').textContent,/thử lại/);assert.equal($('#spaceLogin').disabled,false);
 assert.deepEqual(p.errors,[]);assert.deepEqual(pub.errors,[]);p.dom.window.close();pub.dom.window.close();
 console.log('My Space UI: separate page, legacy shelf/history, profile escaping, create/edit/public shelf, public profile, logout privacy and login retry passed');
})().catch(e=>{console.error(e);process.exit(1)});
