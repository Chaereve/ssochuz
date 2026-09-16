/* Real-browser interaction regression, mock services only. Run with server.py. */
const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'..'),reg=JSON.parse(fs.readFileSync(path.join(root,'data/registry.json'))),slug=reg.lib[0].slug;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 try {
 for(const width of [1440,390,320]){
  const ctx=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'}),p=await ctx.newPage();
  const user={uid:'alice',name:'Alice',email:'private@example.test',exp:Math.floor(Date.now()/1000)+3600};
  let store={id:'a'.repeat(64),version:0,profile:{name:'Alice',bio:'Mỗi ngày một câu chuyện.',avatar:''},shelves:[]},mine=0,failSave=false;
  const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await ctx.addInitScript(({user,slug})=>{localStorage.setItem('ssochuz-user',JSON.stringify(user));localStorage.setItem('ssochuz-auth-token','test-session');localStorage.setItem('ssochuz-shelf',JSON.stringify([slug]));localStorage.setItem('ssochuz-prog-'+slug,'2');}, {user,slug});
  await ctx.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());if(u.host==='localhost:8000')return route.continue();
   let data={},status=200;
   if(u.pathname==='/api/registry')data=reg;
   if(u.pathname==='/api/auth/me')data={ok:true,user};
   if(u.pathname==='/api/me/space'){
    assert.ok(req.headers().authorization);
    if(req.method()==='PUT'){
     const b=req.postDataJSON();if(failSave){status=503;data={error:'Test: chưa lưu được'};}
     else {assert.equal(b.version,store.version);if(b.profile)store.profile=b.profile;if(b.shelf){const s={...b.shelf,id:b.shelf.id||'one'};store.shelves=[s];}if(b.deleteShelf)store.shelves=[];store.version++;}
    }
    if(status===200)data=store;
   }
   if(u.pathname.startsWith('/api/profiles/')){assert.ok(!req.headers().authorization);data={id:store.id,profile:store.profile,shelves:store.shelves.filter(s=>s.visibility==='public')};}
   if(u.pathname.startsWith('/api/book/'))data={title:'Rating test',chapters:[{t:'Chương 1',html:'<p>Đọc</p>'}]};
   if(u.pathname==='/api/rate/me')data={ok:true,rating:mine};
   if(u.pathname==='/api/rate'){mine=req.postDataJSON().rating;data={ok:true,rating:mine,ratingAvg:mine,ratingCount:mine?1:0};}
   return route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  });
  await p.goto('http://localhost:8000/my-space.html');await p.waitForSelector('#newShelf');
  assert.equal(await p.locator('#localShelf .card').count(),1);
  await p.click('[data-space-tab="edit-profile"]');await p.fill('#profileName','Alice đọc sách');await p.fill('#profileBio','Những trang sách và một tách trà.');
  const png = await p.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');x.fillStyle='#b73752';x.fillRect(0,0,64,64);return c.toDataURL('image/png').split(',')[1];});
  await p.setInputFiles('#avatarFile',{name:'avatar.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await p.waitForFunction(()=>document.querySelector('#profileMessage').textContent.includes('sẵn sàng'));
  await p.click('#saveProfile');await p.waitForFunction(()=>document.querySelector('#profileMessage').textContent.includes('Đã lưu'));
  assert.ok(store.profile.avatar.startsWith('data:image/jpeg;base64,'));
  failSave=true;await p.fill('#profileBio','Unsaved draft');await p.click('#saveProfile');await p.waitForFunction(()=>document.querySelector('#profileMessage').textContent.includes('chưa lưu'));assert.equal(store.profile.bio,'Những trang sách và một tách trà.');assert.equal(await p.inputValue('#profileBio'),'Unsaved draft');failSave=false;
  await p.click('[data-space-tab="shelves"]');await p.click('#newShelf');assert.equal(await p.inputValue('#shelfVisibility'),'private');
  await p.fill('#shelfName','Những truyện muốn đọc');await p.check('[data-book="'+slug+'"]');await p.click('#saveShelf');await p.waitForSelector('#shelfDialog',{state:'hidden'});
  assert.equal(store.shelves[0].visibility,'private');
  await p.click('[data-edit-shelf]');await p.selectOption('#shelfVisibility','public');await p.click('#saveShelf');await p.waitForSelector('#shelfDialog',{state:'hidden'});
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'My Space overflow '+width);
  if(process.env.LAYOUT_SCREENSHOTS){fs.mkdirSync(process.env.LAYOUT_SCREENSHOTS,{recursive:true});await p.screenshot({path:path.join(process.env.LAYOUT_SCREENSHOTS,'space-'+width+'.png'),fullPage:true});}
  const pub=await ctx.newPage();await pub.goto('http://localhost:8000/profile.html?id='+store.id);await pub.waitForSelector('#publicShelves .card');assert.equal(await pub.locator('#publicShelves .card').count(),1);assert.ok(!(await pub.locator('main').innerText()).includes(user.email));assert.equal(await pub.locator('#spaceHistory').count(),0);
  await p.click('[data-edit-shelf]');await p.selectOption('#shelfVisibility','private');await p.click('#saveShelf');await p.waitForSelector('#shelfDialog',{state:'hidden'});await pub.reload();await pub.waitForSelector('#publicShelves .empty');assert.equal(await pub.locator('#publicShelves .card').count(),0);
  await p.goto('http://localhost:8000/truyen.html?slug='+slug);await p.waitForSelector('[data-star="5"]');await p.click('[data-star="5"]');await p.waitForFunction(()=>document.querySelector('#removeRating')&&!document.querySelector('#removeRating').hidden);assert.equal(mine,5);
  if(process.env.LAYOUT_SCREENSHOTS)await p.locator('.editable-rating').screenshot({path:path.join(process.env.LAYOUT_SCREENSHOTS,'rating-'+width+'.png')});
  await p.click('#removeRating');await p.waitForFunction(()=>document.querySelector('#removeRating').hidden);assert.equal(mine,0);assert.equal(await p.locator('.stars .on').count(),0);
  await p.mouse.move(0,0);
  const metrics=await p.locator('[data-star="1"]').evaluate(b=>({svg:getComputedStyle(b.querySelector('svg')).width,hit:b.getBoundingClientRect().height,transform:getComputedStyle(b).transform}));
  assert.equal(metrics.svg,width>600?'26px':'24px');assert.ok(metrics.hit>=44);assert.equal(metrics.transform,'none');
  await p.emulateMedia({reducedMotion:'reduce'});await p.focus('[data-star="1"]');
  assert.equal(await p.locator('[data-star="1"] svg').evaluate(e=>getComputedStyle(e).animationName),'none');
  await p.emulateMedia({reducedMotion:'no-preference'});

  assert.deepEqual(errors,[]);await ctx.close();console.log('Chromium '+width+'px: profile/avatar save, failed save retained, shelf CRUD/privacy, public isolation and rating withdrawal passed');
 }
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
