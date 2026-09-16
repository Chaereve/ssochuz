/* My Space: public profiles and account shelves are server-owned.
   Reading history, stats and the legacy saved list remain device-only. */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); }, esc = CZ.esc;
  var isPublic = document.body.dataset.public === 'true';
  var space = null, selectedShelf = '', editingShelf = '', selected = new Set(), avatar = '';
  var epoch = 0, identity, busy = false, avatarBusy = false;
  function user() { return window.CZ_AUTH && CZ_AUTH.current(); }
  async function request(path, method, body) {
    if (!CZ.API) throw Error('Chưa kết nối kho hồ sơ.');
    var headers = { 'content-type': 'application/json' };
    if (path.indexOf('/api/me/') === 0) {
      var token = window.CZ_AUTH && CZ_AUTH.token();
      if (!token) throw Error('Vui lòng đăng nhập để tiếp tục.');
      headers.authorization = 'Bearer ' + token;
    }
    var res = await fetch(CZ.API + path, { method: method || 'GET', cache: 'no-store', headers: headers, body: body ? JSON.stringify(body) : undefined });
    var data = await res.json();
    if (!res.ok) throw Error(data.error || 'Chưa lưu được. Vui lòng thử lại.');
    return data;
  }
  function portrait(p) {
    return p.avatar ? '<img src="' + esc(p.avatar) + '" alt="Ảnh đại diện" width="96" height="96">' : '<span aria-hidden="true">' + esc((p.name || 'B')[0].toUpperCase()) + '</span>';
  }
  function hero(p, owner) {
    $('#spaceHero').innerHTML = '<div class="space-avatar">' + portrait(p) + '</div><div class="space-intro"><p class="space-kicker">' + (owner ? 'MY SPACE / GÓC ĐỌC CỦA BẠN' : 'SSOCHUZ / HỒ SƠ BẠN ĐỌC') + '</p><h1>' + esc(p.name || 'My Space') + '</h1><p class="space-bio">' + esc(p.bio || (owner ? 'Gom những câu chuyện yêu thích về một nơi.' : 'Một người yêu những câu chuyện.')) + '</p></div>' + (owner ? '<a class="btn ghost" href="#edit-profile">Chỉnh sửa hồ sơ</a>' : '');
  }
  function bookGrid(slugs) {
    var books = slugs.map(function (s) { return CZ.findLib(s); }).filter(Boolean);
    return books.length ? '<div class="grid">' + books.map(function (n) { return CZ.card(n); }).join('') + '</div>' : '<p class="empty">Chưa có truyện trong tủ này.</p>';
  }
  function localData() {
    var ids = CZ.shelfIds();
    $('#localShelf').innerHTML = ids.map(function (slug) {
      var n = CZ.findLib(slug);
      return n ? '<div class="local-book">' + CZ.card(n) + '<button class="btn ghost sm" data-remove-local="' + esc(slug) + '">Bỏ khỏi tủ</button></div>' : '';
    }).join('') || '<p class="empty">Tủ còn trống. Bấm Lưu ở trang truyện để thêm vào đây.</p>';
    var history = CZ.lib().filter(function (n) { return CZ.progress(n) > 0; }).sort(function (a,b) { return CZ.lastReadAt(b) - CZ.lastReadAt(a); });
    $('#spaceHistory').innerHTML = history.map(function (n) {
      return '<a class="space-history-row" href="' + esc(CZ.readURL(n.slug,CZ.progress(n))) + '"><span><b>' + esc(n.title) + '</b><small>Chương ' + CZ.progress(n) + ' / ' + n.chapters + (CZ.lastReadAt(n) ? ' · ' + CZ.timeAgo(new Date(CZ.lastReadAt(n)).toISOString()) : '') + '</small></span><span>Đọc tiếp →</span></a>';
    }).join('') || '<p class="empty">Những truyện bạn đã đọc sẽ xuất hiện tại đây.</p>';
    var s = CZ.myReadSummary(), max = Math.max(1, ...s.week.map(function (d) { return d.n; }));
    $('#myStats').innerHTML = '<div id="myStatsPanel" class="space-stat-grid">' + [[s.total,'Chương đã đọc'],[s.today,'Chương hôm nay'],[s.streak,'Ngày liên tiếp'],[history.length,'Truyện đã mở']].map(function (p) { return '<div><strong>' + CZ.num(p[0]) + '</strong><span>' + p[1] + '</span></div>'; }).join('') + '</div><div class="space-week" aria-label="Số chương đã đọc 7 ngày qua">' + s.week.map(function (d) { return '<div><b>' + d.n + '</b><i style="height:' + Math.max(3,100*d.n/max) + 'px"></i><small>' + d.k.slice(6) + '/' + d.k.slice(4,6) + '</small></div>'; }).join('') + '</div>';
  }
  function tab() {
    var key = location.hash.slice(1), keys = ['shelves','history','stats','edit-profile'];
    if (!keys.includes(key)) key = 'shelves';
    keys.forEach(function (k) { $('#space-' + k).hidden = key !== k; });
    document.querySelectorAll('[data-space-tab]').forEach(function (b) { b.classList.toggle('on', b.dataset.spaceTab === key); b.setAttribute('aria-pressed',String(b.dataset.spaceTab === key)); });
  }
  function cloud() {
    $('#cloudShelves').hidden = !space;
    $('#importShelf').hidden = !space || !CZ.shelfIds().length;
    if (!space) return;
    $('#shelfList').innerHTML = space.shelves.map(function (s) {
      return '<button class="space-shelf' + (s.id === selectedShelf ? ' on' : '') + '" data-shelf="' + esc(s.id) + '" aria-pressed="' + (s.id === selectedShelf) + '"><span>' + CZ.icon(s.visibility === 'public' ? 'users' : 'lock','i-s') + '</span><b>' + esc(s.name) + '</b><small>' + s.books.length + ' truyện · ' + (s.visibility === 'public' ? 'Công khai' : 'Riêng tư') + '</small></button>';
    }).join('') || '<p class="empty">Tạo tủ đầu tiên — dành cho truyện muốn đọc, truyện yêu thích, hoặc một couple riêng.</p>';
    var shelf = space.shelves.find(function (s) { return s.id === selectedShelf; });
    if (!shelf && space.shelves.length) { selectedShelf = space.shelves[0].id; return cloud(); }
    $('#shelfContent').innerHTML = shelf ? '<div class="space-panel"><div class="sechead"><h3>' + esc(shelf.name) + '</h3><div class="row"><button class="btn ghost sm" data-edit-shelf>Sửa tủ</button><button class="btn ghost sm" data-delete-shelf>Xoá tủ</button></div></div><p class="space-bio">' + esc(shelf.description) + '</p>' + bookGrid(shelf.books) + '</div>' : '';
  }
  function profileForm() {
    var p = space.profile;
    $('#profileName').value = p.name; $('#profileBio').value = p.bio;
    avatar = p.avatar; $('#avatarPreview').innerHTML = portrait(p);
    $('#profileFields').disabled = false;
    $('#myPublicLink').hidden = false; $('#myPublicLink').href = '/profile?id=' + space.id;
  }
  async function loadAccount(force) {
    var u = user(), key = u && u.uid;
    if (!force && key === identity) return;
    identity = key; var ticket = ++epoch;
    space = null; selectedShelf = ''; avatar = ''; $('#profileFields').disabled = true;
    $('#profileName').value = ''; $('#profileBio').value = ''; $('#avatarPreview').innerHTML = '';
    $('#shelfList').innerHTML = ''; $('#shelfContent').innerHTML = ''; $('#myPublicLink').hidden = true;
    if ($('#shelfDialog').open) $('#shelfDialog').close();
    $('#spaceGuest').hidden = !!u; cloud();
    hero({name:'My Space'},true); $('#spaceStatus').textContent = '';
    if (!u) return;
    $('#spaceStatus').textContent = 'Đang mở không gian của bạn…';
    try {
      var data = await request('/api/me/space'); if (ticket !== epoch) return;
      space = data; hero(space.profile,true); profileForm(); cloud();
      $('#spaceStatus').textContent = '';
      if (space.version > 0 && CZ_AUTH.applyServerProfile) CZ_AUTH.applyServerProfile(space.profile);
    } catch (e) { if (ticket === epoch) { $('#spaceStatus').textContent = e.message; var retry = document.createElement('button'); retry.className='btn ghost sm'; retry.textContent='Thử lại'; retry.onclick=function(){loadAccount(true);}; $('#spaceStatus').appendChild(retry); } }
  }
  async function mutate(change) {
    if (!space || busy) throw Error('Vui lòng chờ dữ liệu hoặc thao tác trước hoàn tất.');
    var ticket = epoch; busy = true;
    try {
      var data = await request('/api/me/space','PUT',Object.assign({version:space.version},change));
      if (ticket !== epoch) throw Error('Tài khoản đã thay đổi.');
      space = data; cloud(); return data;
    } finally { busy = false; }
  }
  function picker() {
    var q = CZ.slugify($('#shelfSearch').value);
    $('#shelfPicker').innerHTML = CZ.lib().filter(function (n) { return !n.slug.startsWith('private-') && (!q || CZ.slugify(n.title + ' ' + n.author + ' ' + n.couple).includes(q)); }).map(function (n) {
      return '<label><input type="checkbox" data-book="' + esc(n.slug) + '"' + (selected.has(n.slug) ? ' checked' : '') + '><span>' + esc(n.title) + '<small>' + esc(n.author || '') + '</small></span></label>';
    }).join('');
    $('#selectedCount').textContent = '(' + selected.size + '/200)';
  }
  function editShelf(shelf, importLocal) {
    if (!space) return;
    editingShelf = shelf ? shelf.id : ''; selected = new Set(shelf ? shelf.books : importLocal ? CZ.shelfIds().filter(function (s) { return !s.startsWith('private-'); }) : []);
    $('#shelfFormTitle').textContent = shelf ? 'Chỉnh sửa tủ' : 'Tạo tủ truyện';
    $('#shelfName').value = shelf ? shelf.name : ''; $('#shelfDescription').value = shelf ? shelf.description : '';
    $('#shelfVisibility').value = shelf ? shelf.visibility : 'private'; $('#shelfSearch').value = ''; $('#shelfMessage').textContent = '';
    picker(); $('#shelfDialog').showModal(); $('#shelfName').focus();
  }
  async function publicPage() {
    var id = new URLSearchParams(location.search).get('id');
    if (!/^[a-f0-9]{64}$/.test(id || '')) { $('#spaceStatus').textContent='Đường dẫn hồ sơ không hợp lệ.'; return; }
    try {
      var data = await request('/api/profiles/' + id);
      hero(data.profile,false); document.title=data.profile.name+' · ssochuz library';
      $('#publicShelves').innerHTML = data.shelves.map(function (s) { return '<section class="space-panel"><h3>' + esc(s.name) + '</h3><p class="space-bio">' + esc(s.description) + '</p>' + bookGrid(s.books) + '</section>'; }).join('') || '<p class="empty">Bạn đọc này chưa chia sẻ tủ truyện nào.</p>';
    } catch(e) { $('#spaceStatus').textContent=e.message; }
  }
  async function init() {
    CZ.mountShell({active:'space'});
    await CZ.registry();
    CZ._setLib();
    if (isPublic) { await publicPage(); CZ.reveal(); return; }
    localData(); tab(); loadAccount(true);
    window.addEventListener('hashchange',tab);
    window.addEventListener('storage',function () { localData(); });
    window.addEventListener('pageshow',localData);
    CZ_AUTH.onAuth(function () { loadAccount(false); });
    document.querySelectorAll('[data-space-tab]').forEach(function (b) { b.onclick=function(){location.hash=b.dataset.spaceTab;}; });
    $('#spaceLogin').onclick=async function(){this.disabled=true;try {await CZ_AUTH.login();} catch(e){$('#spaceStatus').textContent='Chưa đăng nhập được. Vui lòng thử lại.';} finally {this.disabled=false;}};
    $('#localShelf').onclick=function(e){var b=e.target.closest('[data-remove-local]');if(b){CZ.toggleShelf({slug:b.dataset.removeLocal});localData();}};
    $('#clearHistory').onclick=async function(){if (!await CZ.confirm('Xoá lịch sử và tiến độ đọc trên thiết bị này?','Xoá lịch sử')) return; CZ.lib().forEach(function(n){[n.slug,n.postId].filter(Boolean).forEach(function(k){localStorage.removeItem('ssochuz-prog-'+k);localStorage.removeItem('ssochuz-when-'+k);});});localData();};
    $('#newShelf').onclick=function(){editShelf();}; $('#importShelf').onclick=function(){editShelf(null,true);};
    $('#shelfList').onclick=function(e){var b=e.target.closest('[data-shelf]');if(b){selectedShelf=b.dataset.shelf;cloud();}};
    $('#shelfContent').onclick=async function(e){
      var shelf=space && space.shelves.find(function(s){return s.id===selectedShelf;});if(!shelf)return;
      if(e.target.closest('[data-edit-shelf]')) editShelf(shelf);
      if(e.target.closest('[data-delete-shelf]') && await CZ.confirm('Xoá tủ “'+shelf.name+'”? Truyện gốc không bị xoá.','Xoá tủ')) {
        try {await mutate({deleteShelf:shelf.id});}catch(err){$('#spaceStatus').textContent=err.message;}
      }
    };
    $('#closeShelf').onclick=function(){$('#shelfDialog').close();};$('#shelfSearch').oninput=picker;
    $('#shelfPicker').onchange=function(e){var b=e.target.closest('[data-book]');if(!b)return;if(b.checked)selected.add(b.dataset.book);else selected.delete(b.dataset.book);$('#selectedCount').textContent='('+selected.size+'/200)';};
    $('#shelfForm').onsubmit=async function(e){e.preventDefault();var button=$('#saveShelf');button.disabled=true;
      try {if(selected.size>200)throw Error('Mỗi tủ chứa tối đa 200 truyện.');var name=$('#shelfName').value.trim();var before=space.shelves.map(function(s){return s.id;});await mutate({shelf:{id:editingShelf||undefined,name:name,description:$('#shelfDescription').value,visibility:$('#shelfVisibility').value,books:[...selected]}});if(!editingShelf){selectedShelf=(space.shelves.find(function(s){return !before.includes(s.id);})||{}).id;cloud();}$('#shelfDialog').close();}
      catch(err){$('#shelfMessage').textContent=err.message;}finally{button.disabled=false;}
    };
    $('#removeAvatar').onclick=function(){avatar='';$('#avatarFile').value='';$('#avatarPreview').innerHTML=portrait({name:$('#profileName').value});};
    $('#avatarFile').onchange=async function(){var file=this.files[0];if(!file)return;avatarBusy=true;var ticket=epoch;
      try {if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024)throw Error('Chọn ảnh PNG, JPEG hoặc WebP dưới 8 MB.');var image=await createImageBitmap(file);var canvas=document.createElement('canvas');canvas.width=canvas.height=256;var size=Math.min(image.width,image.height);canvas.getContext('2d').drawImage(image,(image.width-size)/2,(image.height-size)/2,size,size,0,0,256,256);image.close();if(ticket!==epoch)return;avatar=canvas.toDataURL('image/jpeg',.85);$('#avatarPreview').innerHTML=portrait({avatar:avatar});$('#profileMessage').textContent='Ảnh đã sẵn sàng. Bấm Lưu hồ sơ để cập nhật.';}
      catch(err){$('#profileMessage').textContent=err.message;}finally{avatarBusy=false;}
    };
    $('#profileForm').onsubmit=async function(e){e.preventDefault();var button=$('#saveProfile');button.disabled=true;
      try {if(avatarBusy)throw Error('Vui lòng chờ xử lý ảnh xong.');await mutate({profile:{name:$('#profileName').value,bio:$('#profileBio').value,avatar:avatar}});hero(space.profile,true);CZ_AUTH.applyServerProfile(space.profile);$('#profileMessage').textContent='Đã lưu hồ sơ công khai.';}
      catch(err){$('#profileMessage').textContent=err.message;}finally{button.disabled=false;}
    };
    CZ.reveal();
  }
  init().catch(function(e){$('#spaceStatus').textContent=e.message;});
})();
