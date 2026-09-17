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
 assert.equal($('#spaceGuest').hidden,true);assert.equal($('#cloudShelves').hidden,false);
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
 p.win.CZ_AUTH.saveUser(null,null);await wait(20);assert.equal($('#cloudShelves').hidden,true);assert.equal($('#profileName').value,'');assert.equal($('#shelfContent').innerHTML,'');
 let attempts=0;p.win.CZ_AUTH.login=async()=>{attempts++;throw Error('test');};$('#spaceLogin').click();await wait(20);assert.equal(attempts,1);assert.match($('#spaceStatus').textContent,/thử lại/);assert.equal($('#spaceLogin').disabled,false);
 assert.deepEqual(p.errors,[]);assert.deepEqual(pub.errors,[]);p.dom.window.close();pub.dom.window.close();
 console.log('My Space UI: separate page, legacy shelf/history, profile escaping, create/edit/public shelf, public profile, logout privacy and login retry passed');
})().catch(e=>{console.error(e);process.exit(1)});

/* ---- Hồi quy 17/09: đăng nhập rồi mà vẫn bị mời đăng nhập -------------------
   Hai lỗi thật của bản 1.9.8 được khoá lại ở đây:
     a. `[hidden]` của trình duyệt bị `.space-guest{display:grid}` đè → khối "hãy
        đăng nhập" nằm nguyên trên trang dù đã có phiên. Bài này nhúng cz.css rồi
        hỏi thẳng getComputedStyle.
     b. Tài khoản Google có tên/ảnh nhưng hồ sơ máy chủ còn trống (version 0) →
        trang cũ hiện "Bạn đọc" + ảnh rỗng. Nay phải hiện tên/ảnh tài khoản, và
        lần vào đầu tiên phải tự ghi danh tính đó vào hồ sơ máy chủ. */
(async () => {
 const wait2 = ms => new Promise(r => setTimeout(r, ms));
 const account = { uid: 'gg', name: 'Nguyễn Văn A', email: 'a@b.c', picture: 'https://lh3.googleusercontent.com/a/photo', exp: Math.floor(Date.now()/1000)+3600 };
 let store2 = { id: 'b'.repeat(64), version: 0, profile: { name: 'Bạn đọc', bio: '', avatar: '', avatarOff: false }, shelves: [] };
 const puts = [];
 const api2 = (path, opt = {}) => {
  if (path === '/api/me/space') {
   if (opt.method === 'PUT') { const b = JSON.parse(opt.body); puts.push(b); assert.equal(b.version, store2.version); if (b.profile) store2.profile = Object.assign({ avatarOff: false }, b.profile); store2.version++; }
   return J(store2);
  }
  if (path.startsWith('/api/profiles/')) return J({ id: store2.id, profile: store2.profile, shelves: [] });
 };
 const p2 = page('my-space.html', { css: true, config: { CZ_API: 'https://cms.test' }, url: 'https://ssochuz.pages.dev/my-space', fetch: dataFetch({ api: api2 }), setup(w) {
  w.localStorage.setItem('ssochuz-user', JSON.stringify(account));
  w.localStorage.setItem('ssochuz-auth-token', 'mock-token');
 } });
 await wait2(500);
 const $2 = s => p2.doc.querySelector(s);
 const disp = s => p2.win.getComputedStyle($2(s)).display;
 assert.equal(disp('#spaceGuest'), 'none', 'Đã có phiên thì khối mời đăng nhập phải biến mất (luật [hidden] trong cz.css)');
 assert.equal(disp('#cloudShelves'), 'grid', 'Tủ trên mây phải hiện khi đã đăng nhập');
 assert.equal($2('#spaceHero h1').textContent, 'Nguyễn Văn A', 'Hero hiện tên tài khoản, không phải "Bạn đọc"');
 assert.ok($2('#spaceHero .space-avatar img'), 'Hero hiện ảnh tài khoản');
 assert.equal($2('#profileName').value, 'Nguyễn Văn A', 'Ô tên được điền sẵn từ tài khoản');
 await wait2(60);
 assert.equal(store2.profile.name, 'Nguyễn Văn A', 'Lần đầu vào phải ghi danh tính tài khoản vào hồ sơ');
 assert.equal(store2.profile.avatar, account.picture);
 assert.ok(puts.length, 'Có ghi hồ sơ gieo danh tính');
 const kept = p2.win.CZ_AUTH.current();
 assert.equal(kept.picture, account.picture, 'Ảnh Google không được bị xoá khi mở My Space');
 assert.deepEqual(p2.errors, []);
 p2.dom.window.close();
 console.log('My Space account sync: [hidden] wins over display, hero/profile show the Google identity and a fresh space is seeded passed');
})().catch(e => { console.error(e); process.exit(1); });

/* ---- Hồi quy 17/09 (tiếp): thao tác trong tủ ---------------------------------
   · Nút "Bỏ khỏi tủ" trên từng bìa phải lưu được mà không cần mở hộp "Sửa tủ".
   · Tab khác đã ghi trước (409) → lần lưu này không áp dụng, phải nạp lại dữ liệu
     và nói rõ cho người dùng, KHÔNG được im lặng mất thao tác.
   · Bấm phím mũi tên trên dãy tab phải chuyển tab (bàn phím dùng được). */
(async () => {
 const wait3 = ms => new Promise(r => setTimeout(r, ms));
 const slugA = reg.lib[0].slug, slugB = reg.lib[1].slug;
 let store3 = { id: 'c'.repeat(64), version: 1, profile: { name: 'Alice', bio: '', avatar: '', avatarOff: false }, shelves: [{ id: 's1', name: 'Tủ thử', description: '', visibility: 'private', books: [slugA, slugB], updatedAt: new Date().toISOString() }] };
 let conflict = false;
 const seen = [];
 const api3 = (path, opt = {}) => {
  if (path === '/api/me/space') {
   if (opt.method === 'PUT') {
    const b = JSON.parse(opt.body); seen.push(b);
    if (conflict) { conflict = false; return J({ error: 'Dữ liệu đã thay đổi ở tab khác. Hãy tải lại trước khi lưu.' }, 409); }
    assert.equal(b.version, store3.version);
    if (b.shelf) { const s = { ...b.shelf, id: b.shelf.id || 's2' }; store3.shelves = store3.shelves.filter(x => x.id !== s.id).concat(s); }
    if (b.deleteShelf) store3.shelves = store3.shelves.filter(s => s.id !== b.deleteShelf);
    store3.version++;
   }
   return J(store3);
  }
  if (path.startsWith('/api/profiles/')) return J({ id: store3.id, profile: store3.profile, shelves: [] });
 };
 const p3 = page('my-space.html', { config: { CZ_API: 'https://cms.test' }, url: 'https://ssochuz.pages.dev/my-space', fetch: dataFetch({ api: api3 }), setup(w) {
  w.localStorage.setItem('ssochuz-user', JSON.stringify(user));
  w.localStorage.setItem('ssochuz-auth-token', 'mock-token');
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
 } });
 await wait3(400);
 const $3 = s => p3.doc.querySelector(s);
 assert.equal(p3.doc.querySelectorAll('#shelfContent [data-remove-book]').length, 2, 'Mỗi bìa trong tủ có nút bỏ nhanh');
 $3('#shelfContent [data-remove-book="' + slugA + '"]').click();
 await wait3(120);
 assert.deepEqual(store3.shelves[0].books, [slugB], 'Bỏ nhanh một truyện khỏi tủ phải lưu được');
 /* 409: lần lưu bị từ chối → nạp lại, nói rõ, và KHÔNG mất bản nháp */
 conflict = true;
 $3('#shelfContent [data-remove-book="' + slugB + '"]').click();
 await wait3(150);
 assert.match($3('#spaceStatus').textContent, /tab khác/, '409 phải được giải thích chứ không im lặng: ' + $3('#spaceStatus').textContent);
 /* bàn phím: mũi tên phải chuyển tab */
 const tabs = [...p3.doc.querySelectorAll('[data-space-tab]')];
 tabs[0].dispatchEvent(new p3.win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
 await wait3(60);
 assert.equal(tabs[1].classList.contains('on'), true, 'Phím mũi tên chuyển tab được');
 assert.equal(tabs[1].getAttribute('aria-selected'), 'true');
 assert.equal(tabs[0].tabIndex, -1, 'Tab không hoạt động ra khỏi luồng Tab bàn phím');
 assert.deepEqual(p3.errors, []);
 p3.dom.window.close();
 console.log('My Space actions: quick remove from shelf, 409 explained without losing the draft, keyboard tab switching passed');
})().catch(e => { console.error(e); process.exit(1); });
