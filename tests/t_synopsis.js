const assert=require('node:assert/strict');
const {page,dataFetch,read}=require('./mk');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const reg=JSON.parse(read('data/registry.json'));
const slug=reg.lib[0].slug;
reg.lib[0].syn='Bản rút gọn';delete reg.lib[0].synFull;
const full='Đoạn đầu. '.repeat(70)+'\nĐoạn cuối không được mất <script>alert(1)</script>';
const J=body=>Promise.resolve({ok:true,json:async()=>body,text:async()=>JSON.stringify(body)});
(async()=>{
 for(const field of ['synFull','syn']){
  const book={title:'Tóm tắt dài',chapters:[{t:'Một',html:'<p>Nội dung</p>'}],[field]:full};
  const p=page('truyen.html',{url:'https://ssochuz.pages.dev/truyen.html?slug='+slug,config:{CZ_API:'https://cms.test'},fetch:dataFetch({api:path=>path==='/api/registry'?J(reg):path==='/api/book/'+slug?J(book):path==='/api/stats'?J({ok:true,items:{}}):undefined})});
  await wait(400);
  let button=p.doc.querySelector('#synToggle');assert.ok(button,'Control must survive zero-height early layout');
  assert.equal(button.getAttribute('aria-expanded'),'false');button.click();
  assert.equal(button.getAttribute('aria-expanded'),'true');assert.match(button.textContent,/Thu gọn/);
  assert.ok(p.doc.querySelector('#synWrap').classList.contains('open'));
  assert.match(p.doc.querySelector('#synIn').textContent,/Đoạn cuối không được mất/);
  assert.equal(p.doc.querySelector('#synIn script'),null);
  p.win.CZ.notifyStats();await wait(40);
  button=p.doc.querySelector('#synToggle');assert.equal(button.getAttribute('aria-expanded'),'true');
  button.click();assert.equal(button.getAttribute('aria-expanded'),'false');assert.ok(!p.doc.querySelector('#synWrap').classList.contains('open'));
  assert.equal(p.doc.querySelector('#synFull'),null);
  assert.equal(p.doc.querySelector('[data-tab="info"]').textContent,'Thông tin');
  p.doc.querySelector('[data-tab="info"]').click();
  assert.equal(p.doc.querySelector('#pane-info').hidden,false);
  assert.ok(!p.doc.querySelector('#pane-info').textContent.includes('Đoạn cuối không được mất'));
  assert.ok(p.doc.querySelector('#storyInfo').textContent.includes('Tác giả'));
  assert.deepEqual(p.errors,[]);p.dom.window.close();
 }
 console.log('Synopsis: full source + legacy source, expand/collapse, label, repaint persistence, paragraphs and safe escaping passed.');
})().catch(e=>{console.error(e);process.exit(1)});
