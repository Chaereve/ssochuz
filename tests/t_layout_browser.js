/* Optional real-browser regression. Start server.py, then:
   CHROMIUM_EXECUTABLE=/path/to/chromium node tests/t_layout_browser.js
   Uses local fixtures only; never writes production data. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'..');
const reg=JSON.parse(fs.readFileSync(path.join(root,'data/registry.json')));
const slug=reg.lib[0].slug;
const full='Một đoạn tóm tắt đầy đủ để kiểm tra phần hiển thị trên màn hình nhỏ. '.repeat(60)+'\nĐÂY LÀ ĐOẠN CUỐI.';
const items={}; reg.lib.slice(0,5).forEach((n,i)=>items[n.slug]={viewsDay:20-i,viewsWeek:30-i,viewsMonth:40-i,votesDay:5+i,votesWeek:10+i,votesMonth:20+i,rating:5-i*.1,ratingCount:10+i});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 try {
 const context=await browser.newContext({serviceWorkers:'block'}); const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.host==='localhost:8000') return route.continue();
  let body={};
  if(u.pathname==='/api/registry') body=reg;
  else if(u.pathname==='/api/stats') body={ok:true,items};
  else if(u.pathname.startsWith('/api/book/')) body={title:'Kiểm tra tóm tắt',synFull:full,chapters:[{t:'Chương 1',html:'<p>Nội dung</p>'}]};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 for(const width of [1440,768,390,320]) {
  await page.setViewportSize({width,height:1000});
  await page.goto('http://localhost:8000/');
  await page.waitForSelector('#rank .rank');
  for(const mode of ['views','votes']) for(const period of ['day','week','month']) {
   await page.click('[data-mode="'+mode+'"]');await page.click('#rankTabs [data-k="'+period+'"]');
   assert.equal(await page.locator('#rank .rank').count(),5);
  }
  assert.equal(await page.locator('#worthRail .worth-score').count(),5);
  if (process.env.LAYOUT_SCREENSHOTS && (width === 1440 || width === 390)) {
    fs.mkdirSync(process.env.LAYOUT_SCREENSHOTS, { recursive: true });
    await page.locator('#bxh').screenshot({ path: path.join(process.env.LAYOUT_SCREENSHOTS, 'ranking-' + width + '.png') });
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'home overflow '+width);
  await page.goto('http://localhost:8000/truyen.html?slug='+slug);
  await page.waitForSelector('#synToggle');
  const collapsed=await page.locator('#synIn').evaluate(e=>e.clientHeight);
  await page.click('#synToggle');
  const expanded=await page.locator('#synIn').evaluate(e=>({client:e.clientHeight,scroll:e.scrollHeight,mask:getComputedStyle(e).maskImage}));
  assert.ok(expanded.client>collapsed,'expansion height '+width);assert.ok(expanded.scroll<=expanded.client+1);assert.equal(expanded.mask,'none');
  await page.click('#synToggle');assert.ok(await page.locator('#synIn').evaluate(e=>e.clientHeight)<expanded.client);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'story overflow '+width);
  for(const url of ['/tac-gia/','/couple/','/guide','/admin','/my-space.html']) {
   await page.goto('http://localhost:8000'+url);
   await page.waitForLoadState('domcontentloaded');
   if(url.includes('tac-gia')||url.includes('couple')) await page.waitForSelector('.pcard');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),url+' overflow '+width);
  }
  console.log('Browser layout '+width+'px: Ranking (6 modes), ratings rail, full synopsis, people, guide and admin gate passed');
 }
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('http://localhost:8000/');await page.waitForSelector('#rank .rank');
 assert.equal(await page.locator('#rank .rank').first().evaluate(e=>getComputedStyle(e).animationName),'none');
 assert.deepEqual(errors,[]);await context.close();
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
