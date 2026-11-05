const assert = require('node:assert/strict');
const {page,dataFetch,read} = require('./mk');
const wait = ms => new Promise(r=>setTimeout(r,ms));
const reg = JSON.parse(read('data/registry.json'));
const [a,b,c,d] = reg.lib.slice(0,4).map(n=>n.slug);
/* Vòng 17b: chỉ còn Tháng + Tất cả (all-time = views/votes trọn đời).
   d trội về trọn đời (700/600) nhưng KHÔNG có số tháng → kiểm "Tất cả" dùng
   counter trọn đời, còn "Tháng" chỉ dùng viewsMonth/votesMonth. */
const items = {
 [a]:{views:500,votes:300,viewsMonth:10,votesMonth:3,rating:4.8,ratingCount:2},
 [b]:{views:100,votes:100,viewsMonth:80,votesMonth:1,rating:4.8,ratingCount:8},
 [c]:{views:100,votes:100,viewsMonth:3,votesMonth:50,rating:4.5,ratingCount:100},
 [d]:{views:700,votes:600,rating:5,ratingCount:0}
};
const J = body => Promise.resolve({ok:true,json:async()=>body,text:async()=>JSON.stringify(body)});
(async()=>{
 const p=page('index.html',{config:{CZ_API:'https://cms.test'},fetch:dataFetch({api:path=>path==='/api/registry'?J(reg):path==='/api/stats'?J({ok:true,items}):undefined})});
 await wait(450);
 const click=s=>p.doc.querySelector(s).click();
 const first=()=>p.doc.querySelector('#rank .rank').getAttribute('href');
 /* lượt cuối là votes-month để phần kiểm cập nhật trực tiếp bên dưới (đặt
    c.votesMonth=100) chạy trên đúng kỳ Tháng. */
 for(const [mode,period,slug,score] of [['views','month',b,80],['views','all',d,700],['votes','all',d,600],['votes','month',c,50]]){
  click('[data-mode="'+mode+'"]');click('#rankTabs [data-k="'+period+'"]');
  assert.ok(first().includes(slug),mode+' '+period);
  assert.ok(p.doc.querySelector('#rank .v').textContent.startsWith(String(score)+' '));
  assert.equal(p.doc.querySelectorAll('#rankTabs [aria-pressed="true"]').length,1);
  assert.equal(p.doc.activeElement.dataset.k,period);
 }
 /* r120: “Đáng xem” là một dải RIÊNG dưới Ranking (không còn chung khung hai cột),
    nhưng vẫn giữ nhịp hàng và tối đa 5 dòng; điểm ★ (+ số đánh giá) ở cột phải. */
 const cards=[...p.doc.querySelectorAll('#worthRail .wrank')];
 assert.equal(cards.length,3);
 assert.ok(cards[0].outerHTML.includes(b));assert.ok(cards[1].outerHTML.includes(a));
 assert.equal(cards[0].querySelector('.v').textContent,'★4.8');
 assert.equal(cards[0].querySelector('.tt span').textContent,'8 đánh giá');
 p.win.CZ._memo.stats.items[c].votesMonth=100; p.win.CZ._memo.stats.items[c].rating=5; p.win.CZ.notifyStats();
 assert.ok(first().includes(c));assert.ok(p.doc.querySelector('#worthRail .wrank').outerHTML.includes(c));
 p.win.CZ._memo.stats.items={}; p.win.CZ.notifyStats();
 assert.equal(p.doc.querySelectorAll('#rank .rank').length,0);assert.equal(p.doc.querySelector('#bxh').hidden,false);
 assert.equal(p.doc.querySelectorAll('#worthRail .wrank').length,0);assert.ok(p.doc.querySelector('#rank .empty'));
 p.win.CZ._memo.stats.on=false;p.win.CZ.notifyStats();
 assert.equal(p.doc.querySelector('#rank').textContent,'');
 assert.equal(p.doc.querySelector('#worthRail').textContent,'');
 assert.deepEqual(p.errors,[]);p.dom.window.close();
 console.log('Ranking: Tháng + Tất cả (all-time dùng counter trọn đời), exact counters, rating ties, live updates, keyboard focus and empty/offline states passed.');
})().catch(e=>{console.error(e);process.exit(1)});
