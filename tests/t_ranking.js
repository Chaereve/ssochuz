const assert = require('node:assert/strict');
const {page,dataFetch,read} = require('./mk');
const wait = ms => new Promise(r=>setTimeout(r,ms));
const reg = JSON.parse(read('data/registry.json'));
const [a,b,c,d] = reg.lib.slice(0,4).map(n=>n.slug);
const items = {
 [a]:{views:999999,votes:999999,viewsDay:3,viewsWeek:90,viewsMonth:10,votesDay:8,votesWeek:1,votesMonth:3,rating:4.8,ratingCount:2},
 [b]:{views:100,votes:100,viewsDay:10,viewsWeek:5,viewsMonth:80,votesDay:2,votesWeek:20,votesMonth:1,rating:4.8,ratingCount:8},
 [c]:{views:100,votes:100,viewsDay:1,viewsWeek:2,viewsMonth:3,votesDay:1,votesWeek:2,votesMonth:50,rating:4.5,ratingCount:100},
 [d]:{views:999999,votes:999999,rating:5,ratingCount:0}
};
const J = body => Promise.resolve({ok:true,json:async()=>body,text:async()=>JSON.stringify(body)});
(async()=>{
 const p=page('index.html',{config:{CZ_API:'https://cms.test'},fetch:dataFetch({api:path=>path==='/api/registry'?J(reg):path==='/api/stats'?J({ok:true,items}):undefined})});
 await wait(450);
 const click=s=>p.doc.querySelector(s).click();
 const first=()=>p.doc.querySelector('#rank .rank').getAttribute('href');
 for(const [mode,period,slug,score] of [['views','day',b,10],['views','week',a,90],['views','month',b,80],['votes','day',a,8],['votes','week',b,20],['votes','month',c,50]]){
  click('[data-mode="'+mode+'"]');click('#rankTabs [data-k="'+period+'"]');
  assert.ok(first().includes(slug),mode+' '+period);
  assert.ok(p.doc.querySelector('#rank .v').textContent.startsWith(String(score)+' '));
  assert.equal(p.doc.querySelectorAll('#rankTabs [aria-pressed="true"]').length,1);
  assert.equal(p.doc.activeElement.dataset.k,period);
 }
 const cards=[...p.doc.querySelectorAll('#worthRail .card')];
 assert.equal(cards.length,3);
 assert.ok(cards[0].outerHTML.includes(b));assert.ok(cards[1].outerHTML.includes(a));
 assert.equal(cards[0].querySelector('.worth-score').textContent,'★ 4.8/5 · 8 đánh giá');
 p.win.CZ._memo.stats.items[c].votesMonth=100; p.win.CZ._memo.stats.items[c].rating=5; p.win.CZ.notifyStats();
 assert.ok(first().includes(c));assert.ok(p.doc.querySelector('#worthRail .card').outerHTML.includes(c));
 p.win.CZ._memo.stats.items={}; p.win.CZ.notifyStats();
 assert.equal(p.doc.querySelectorAll('#rank .rank').length,0);assert.equal(p.doc.querySelector('#bxh').hidden,false);
 assert.equal(p.doc.querySelectorAll('#worthRail .card').length,0);assert.ok(p.doc.querySelector('#rank .empty'));
 p.win.CZ._memo.stats.on=false;p.win.CZ.notifyStats();
 assert.equal(p.doc.querySelector('#rank').textContent,'');
 assert.equal(p.doc.querySelector('#worthRail').textContent,'');
 assert.deepEqual(p.errors,[]);p.dom.window.close();
 console.log('Ranking: all six periods, exact counters, no lifetime fallback, rating ties, live updates, keyboard focus and empty/offline states passed.');
})().catch(e=>{console.error(e);process.exit(1)});
