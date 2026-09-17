/* My Space: public profiles and account shelves are server-owned.
   Reading history, stats and the legacy saved list remain device-only.

   Bản 1.9.9 — ba bệnh của bản trước được vá ở đây:
     · Quay về từ Google mà supabase-js chưa đổi xong `?code=…`: trang cũ kết luận
       ngay "chưa đăng nhập" rồi đứng im. Nay chờ CZ_AUTH (state/whenSettled/onAuth),
       chỉ hiện lời mời đăng nhập khi phiên đã chốt là KHÔNG có.
     · Hồ sơ máy chủ mới toanh để tên "Bạn đọc" + ảnh rỗng đè lên tên/ảnh Google:
       nay tên/ảnh lấy từ tài khoản trước, hồ sơ máy chủ chỉ thắng khi người dùng
       đã thật sự lưu — và lần đầu vào thì tự ghi tên/ảnh tài khoản vào hồ sơ.
     · Lưu hồ sơ xong mà ảnh Google bị xoá khỏi thanh đầu trang: nay có cờ
       `avatarOff` đi kèm hồ sơ, ảnh chỉ bị bỏ khi chính người dùng bấm "Bỏ ảnh". */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); }, esc = CZ.esc;
  var isPublic = document.body.dataset.public === 'true';
  var space = null, selectedShelf = '', editingShelf = '', selected = new Set(), avatar = '', avatarSource = '', avatarOff = false;
  var epoch = 0, identity, busy = false, avatarBusy = false, loadFailed = false, seededFor = '', pickerLimit = 40;

  function user() { return window.CZ_AUTH && CZ_AUTH.current(); }
  function authState() {
    if (window.CZ_AUTH && CZ_AUTH.state) return CZ_AUTH.state();
    return user() ? 'in' : 'out';
  }
  function setMessage(el, text, kind) {
    if (!el) return;
    el.textContent = text || '';
    if (kind) el.setAttribute('data-kind', kind); else el.removeAttribute('data-kind');
  }
  async function request(path, method, body) {
    if (!CZ.API) throw Error('Chưa kết nối kho hồ sơ.');
    var headers = { 'content-type': 'application/json' };
    if (path.indexOf('/api/me/') === 0) {
      var token = window.CZ_AUTH && CZ_AUTH.token();
      if (!token) throw Error('Vui lòng đăng nhập để tiếp tục.');
      headers.authorization = 'Bearer ' + token;
    }
    var res;
    try {
      res = await fetch(CZ.API + path, { method: method || 'GET', cache: 'no-store', headers: headers, body: body ? JSON.stringify(body) : undefined });
    } catch (e) {
      var netErr = Error('Không gọi được máy chủ hồ sơ — kiểm tra mạng rồi thử lại.');
      netErr.offline = true;
      throw netErr;
    }
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      var err = Error(data.error || ('Máy chủ trả lỗi ' + res.status + '. Vui lòng thử lại.'));
      err.status = res.status;
      throw err;
    }
    return data;
  }
  function picture(p) {
    var av = String((p && p.avatar) || '').trim();
    if (!av) return '';
    if (/^data:image\//i.test(av) || /^https:\/\//i.test(av)) return av;
    return '';
  }
  function portrait(p) {
    var av = picture(p);
    return av ? '<img src="' + esc(av) + '" alt="" width="96" height="96" loading="lazy" decoding="async" referrerpolicy="no-referrer">'
      : '<span aria-hidden="true">' + esc(String((p && p.name) || 'B').charAt(0).toUpperCase()) + '</span>';
  }
  /* Hồ sơ hiển thị = hồ sơ máy chủ, nhưng PHẦN CHƯA CÓ thì lấy từ tài khoản.
     Nhờ vậy người vừa đăng nhập Google thấy ngay tên/ảnh của mình, không phải
     "Bạn đọc" — và cũng không phải chờ lưu hồ sơ mới thấy. */
  function displayProfile() {
    var u = user() || {};
    var srv = (space && space.profile) || {};
    var srvName = String(srv.name || '').trim();
    if (srvName === 'Bạn đọc') srvName = '';
    var srvPic = picture(srv);
    var saved = !!(space && space.version > 0);
    var name = (saved && srvName) || String(u.name || '').trim() || srvName || 'My Space';
    var pic = '';
    if (saved) pic = srvPic || (srv.avatarOff ? '' : String(u.picture || ''));
    else pic = String(u.picture || '') || srvPic;
    return { name: name, bio: String(srv.bio || ''), avatar: pic, saved: saved, serverName: srvName, serverAvatar: srvPic, avatarOff: !!srv.avatarOff };
  }
  function isOwnPicture(src) {
    var u = user() || {};
    return !!src && !!u.picture && String(src) === String(u.picture);
  }
  var ADJUST_HINT = 'Bấm “Di chuyển & cắt ảnh” nếu muốn căn lại khung.';

  function hero(p, owner) {
    var host = $('#spaceHero');
    if (!host) return;
    var name = p.name || 'My Space';
    /* Lời dẫn mặc định: chủ trang chưa đăng nhập thì nói về việc sắp làm, khách
       xem hồ sơ công khai thì một câu trung tính. */
    var bio = p.bio || (owner ? (p.checking ? 'Đang kiểm tra phiên đăng nhập…' : (p.guest ? 'Một người yêu những câu chuyện.' : 'Gom những câu chuyện yêu thích về một nơi.')) : 'Một người yêu những câu chuyện.');
    host.innerHTML = '<div class="space-hero-orbit" aria-hidden="true"><span></span><i>✦</i></div>' +
      '<div class="space-avatar space-hero-avatar">' + portrait(p) + '</div>' +
      '<div class="space-intro"><div class="space-hero-label"><p class="space-kicker">' + (owner ? 'MY SPACE / GÓC ĐỌC CỦA BẠN' : 'SSOCHUZ / HỒ SƠ BẠN ĐỌC') + '</p><span class="space-live-dot" aria-hidden="true"></span></div>' +
      '<h1>' + esc(name) + '</h1><p class="space-bio">' + esc(bio) + '</p>' +
      '<div class="space-hero-rule" aria-hidden="true"><span></span></div></div>' +
      (owner && user() ? '<a class="btn ghost space-hero-action" href="#edit-profile">Chỉnh sửa hồ sơ <span aria-hidden="true">↗</span></a>' : '');
    if (owner) host.hidden = false;
  }
  function heroFromAccount() {
    var u = user();
    var d = displayProfile();
    hero({ name: u ? d.name : 'My Space', bio: space ? d.bio : '', avatar: u ? d.avatar : '', checking: authState() === 'checking', guest: !u }, true);
  }
  function bookGrid(slugs, editable) {
    var books = slugs.map(function (s) { return CZ.findLib(s); }).filter(Boolean);
    if (!books.length) return '<p class="empty">Chưa có truyện trong tủ này.</p>';
    return '<div class="grid space-book-grid">' + books.map(function (n, i) {
      return '<div class="space-book-cell" style="--space-delay:' + (i * 45) + 'ms">' + CZ.card(n) +
        (editable ? '<button class="btn ghost sm" type="button" data-remove-book="' + esc(n.slug) + '" title="Bỏ khỏi tủ này" aria-label="Bỏ ' + esc(n.title) + ' khỏi tủ này">Bỏ khỏi tủ</button>' : '') +
        '</div>';
    }).join('') + '</div>';
  }
  function timeVN(ms) {
    if (!ms) return '';
    try { return CZ.timeAgo(new Date(ms).toISOString()); } catch (e) { return ''; }
  }
  function localData() {
    var ids = CZ.shelfIds();
    var localSection = document.querySelector('.local-shelf');
    var cloud = !!space;
    if (localSection) localSection.classList.toggle('has-cloud', cloud);
    var note = $('#localShelfNote');
    if (note) {
      note.textContent = cloud
        ? 'Danh sách lưu trên trình duyệt này — không nằm trong tủ đã đồng bộ theo tài khoản.'
        : 'Đã lưu trên trình duyệt này · đăng nhập để đồng bộ giữa các thiết bị.';
    }
    var localCount = $('#localShelfCount');
    if (localCount) localCount.innerHTML = ids.length ? '<strong>' + CZ.num(ids.length) + '</strong> truyện' : 'Chưa có truyện';
    var localShelfEl = $('#localShelf');
    if (localShelfEl) {
      localShelfEl.innerHTML = ids.map(function (slug, i) {
        var n = CZ.findLib(slug);
        return n ? '<div class="local-book space-book-cell" style="--space-delay:' + (i * 45) + 'ms">' + CZ.card(n) + '<button class="btn ghost sm" type="button" data-remove-local="' + esc(slug) + '">Bỏ khỏi tủ</button></div>' : '';
      }).join('') || '<p class="empty">Tủ còn trống. Bấm Lưu ở trang truyện để thêm vào đây.</p>';
    }

    var history = CZ.lib().filter(function (n) { return CZ.progress(n) > 0; }).sort(function (a, b) { return CZ.lastReadAt(b) - CZ.lastReadAt(a); });
    $('#spaceHistory').innerHTML = history.map(function (n) {
      var ch = CZ.progress(n), total = Number(n.chapters) || 0;
      var pct = total ? Math.min(100, Math.round(ch / total * 100)) : 0;
      var done = total > 0 && ch >= total;
      var cover = n.thumb || n.slide || '';
      return '<div class="space-history-row' + (done ? ' is-done' : '') + '">' +
        '<a class="space-history-cover' + (cover ? '' : ' noimg') + '" href="' + esc(CZ.readURL(n.slug, ch)) + '" aria-hidden="true" tabindex="-1">' +
          (cover ? '<img src="' + esc(cover) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : esc(String(n.title || '?').charAt(0).toUpperCase())) + '</a>' +
        '<div class="space-history-main"><b>' + esc(n.title) + '</b>' +
          '<small>Chương ' + CZ.num(ch) + (total ? ' / ' + CZ.num(total) : '') + (CZ.lastReadAt(n) ? ' · ' + timeVN(CZ.lastReadAt(n)) : '') + (done ? ' · đã hết' : '') + '</small>' +
          '<span class="space-history-bar" aria-hidden="true"><i style="width:' + pct + '%"></i></span></div>' +
        '<div class="space-history-tail"><a class="go" href="' + esc(CZ.readURL(n.slug, ch)) + '">Đọc tiếp →</a>' +
          '<button class="btn ghost sm" type="button" data-forget="' + esc(n.slug) + '" title="Xoá tiến độ truyện này" aria-label="Xoá tiến độ đọc truyện ' + esc(n.title) + '">Xoá</button></div>' +
      '</div>';
    }).join('') || '<p class="empty">Những truyện bạn đã đọc sẽ xuất hiện tại đây. <a href="/">Chọn một bộ để bắt đầu →</a></p>';

    var s = CZ.myReadSummary(), max = Math.max(1, ...s.week.map(function (d) { return d.n; }));
    var tiles = [[s.total, 'Chương đã đọc'], [s.today, 'Chương hôm nay'], [s.streak, 'Ngày liên tiếp'], [history.length, 'Truyện đã mở']];
    $('#myStats').innerHTML = '<div id="myStatsPanel" class="space-stat-grid">' + tiles.map(function (p) {
      return '<div><strong>' + CZ.num(p[0]) + '</strong><span>' + p[1] + '</span></div>';
    }).join('') + '</div><div class="space-week" role="img" aria-label="Số chương đã đọc 7 ngày qua">' + s.week.map(function (d) {
      return '<div><b>' + d.n + '</b><i style="height:' + Math.max(3, 100 * d.n / max) + 'px"></i><small>' + d.k.slice(6) + '/' + d.k.slice(4, 6) + '</small></div>';
    }).join('') + '</div>' +
      (s.total ? '' : '<p class="empty">Chưa có số liệu — mở một chương và đọc tới cuối để bắt đầu đếm.</p>');
  }
  function tab(focusPanel) {
    var key = location.hash.slice(1), keys = ['shelves', 'history', 'stats', 'edit-profile'];
    if (!keys.includes(key)) key = 'shelves';
    keys.forEach(function (k) {
      var panel = $('#space-' + k), active = k === key;
      panel.hidden = !active;
      panel.classList.toggle('space-view-active', active);
      if (active) {
        panel.classList.remove('space-view-enter');
        void panel.offsetWidth;
        panel.classList.add('space-view-enter');
      }
    });
    document.querySelectorAll('[data-space-tab]').forEach(function (b) {
      var active = b.dataset.spaceTab === key;
      b.classList.toggle('on', active);
      b.setAttribute('aria-pressed', String(active));
      b.setAttribute('aria-selected', String(active));
      b.tabIndex = active ? 0 : -1;
    });
    if (focusPanel) { var on = $('#space-' + key); if (on && on.focus) on.focus(); }
  }
  function moveTab(step) {
    var tabs = [...document.querySelectorAll('[data-space-tab]')];
    var i = tabs.findIndex(function (b) { return b.classList.contains('on'); });
    var next = tabs[(i + step + tabs.length) % tabs.length];
    if (!next) return;
    location.hash = next.dataset.spaceTab;
    next.focus();
  }
  function cloud() {
    $('#cloudShelves').hidden = !space;
    var localIds = CZ.shelfIds();
    var importable = localIds.filter(function (s) { return !s.startsWith('private-'); });
    var already = !space ? 0 : importable.filter(function (slug) {
      return space.shelves.some(function (sh) { return sh.books.indexOf(slug) >= 0; });
    }).length;
    $('#importShelf').hidden = !space || !importable.length || already === importable.length;
    var shelfCount = $('#spaceShelfCount');
    if (shelfCount) {
      var books = space ? space.shelves.reduce(function (a, s) { return a + s.books.length; }, 0) : 0;
      shelfCount.innerHTML = space
        ? '<strong>' + CZ.num(space.shelves.length) + '</strong><span>tủ · ' + CZ.num(books) + ' truyện</span>'
        : '<strong>—</strong><span>tủ của bạn</span>';
    }
    if (!space) return;
    $('#shelfList').innerHTML = space.shelves.map(function (s, i) {
      return '<button class="space-shelf' + (s.id === selectedShelf ? ' on' : '') + '" data-shelf="' + esc(s.id) + '" aria-pressed="' + (s.id === selectedShelf) + '" style="--space-delay:' + (i * 45) + 'ms" type="button"><span class="space-shelf-icon">' + CZ.icon(s.visibility === 'public' ? 'users' : 'lock', 'i-s') + '</span><b>' + esc(s.name) + '</b><small>' + CZ.num(s.books.length) + ' truyện · ' + (s.visibility === 'public' ? 'Công khai' : 'Riêng tư') + '</small><span class="space-shelf-arrow" aria-hidden="true">↗</span></button>';
    }).join('') || '<p class="empty">Tạo tủ đầu tiên — dành cho truyện muốn đọc, truyện yêu thích, hoặc một couple riêng.</p>';
    var shelf = space.shelves.find(function (s) { return s.id === selectedShelf; });
    if (!shelf && space.shelves.length) { selectedShelf = space.shelves[0].id; return cloud(); }
    $('#shelfContent').innerHTML = shelf
      ? '<div class="space-panel shelf-detail-panel"><div class="sechead"><div><p class="section-eyebrow">ĐANG XEM</p><h3>' + esc(shelf.name) + '</h3></div><div class="space-toolbar"><button class="btn ghost sm" type="button" data-edit-shelf>Sửa tủ</button><button class="btn ghost sm" type="button" data-delete-shelf>Xoá tủ</button></div></div>' +
        (shelf.description ? '<p class="space-bio">' + esc(shelf.description) + '</p>' : '') +
        '<div class="shelf-detail-meta"><span>' + CZ.num(shelf.books.length) + ' truyện</span><span>' + (shelf.visibility === 'public' ? 'Công khai trên hồ sơ' : 'Chỉ mình bạn thấy') + '</span>' + (shelf.updatedAt ? '<span>Cập nhật ' + esc(timeVN(new Date(shelf.updatedAt).getTime())) + '</span>' : '') + '</div>' +
        (shelf.books.length ? bookGrid(shelf.books, true) : '<div class="shelf-detail-empty"><p>Tủ này còn trống.</p><button class="btn pri sm" type="button" data-edit-shelf>Thêm truyện</button></div>') +
        '</div>'
      : '<div class="space-panel shelf-empty-panel"><span class="space-empty-mark" aria-hidden="true">✦</span><h3>Chọn một tủ để bắt đầu</h3><p class="space-note">Tạo một tủ nhỏ cho những câu chuyện bạn đang để mắt tới.</p></div>';
  }
  function paintAvatar() {
    $('#avatarPreview').innerHTML = portrait({ avatar: avatar, name: $('#profileName').value });
    var adjust = $('#adjustAvatar');
    if (adjust) adjust.hidden = !avatarSource || !(window.CZ_AUTH && CZ_AUTH.cropAvatar);
    var google = $('#useAccountAvatar');
    if (google) {
      var acc = (user() || {}).picture || '';
      google.hidden = !acc || isOwnPicture(avatar);
    }
  }
  function counts() {
    var n = $('#profileName'), b = $('#profileBio'), nc = $('#profileNameCount'), bc = $('#profileBioCount');
    if (nc && n) { nc.textContent = n.value.length + '/40'; nc.classList.toggle('over', n.value.length >= 40); }
    if (bc && b) { bc.textContent = b.value.length + '/500'; bc.classList.toggle('over', b.value.length >= 500); }
  }
  function profileForm(profile) {
    profile = profile || displayProfile();
    $('#profileName').value = profile.name === 'My Space' ? '' : profile.name;
    $('#profileBio').value = profile.bio || '';
    releaseAvatarSource();
    avatar = picture(profile) || '';
    avatarOff = !!profile.avatarOff && !avatar;
    $('#profileFields').disabled = false;
    paintAvatar(); counts();
    $('#myPublicLink').hidden = false; $('#myPublicLink').href = '/profile?id=' + space.id;
    var copy = $('#copyProfileLink'); if (copy) copy.hidden = false;
    setMessage($('#profileMessage'), '');
  }
  function releaseAvatarSource() {
    if (avatarSource && avatarSource.indexOf('blob:') === 0) {
      try { URL.revokeObjectURL(avatarSource); } catch (e) {}
    }
    avatarSource = '';
  }
  function guestLoginNote(show) {
    var note = $('#profileGuestNote'), fields = $('#profileFields');
    if (note) note.hidden = !show;
    if (fields) fields.disabled = !!show || !user();
    var shelfNotice = $('#shelfGuestNotice');
    if (shelfNotice) shelfNotice.hidden = !show;
    var openBtn = $('#openNewShelf');
    if (openBtn) openBtn.hidden = !!show;
  }
  function paintSession() {
    var st = authState(), u = user();
    $('#spaceGuest').hidden = !!u || st === 'checking';
    var loginBtn = $('#spaceLogin');
    if (loginBtn) loginBtn.hidden = !!u;
    var shelfNotice = $('#shelfGuestNotice');
    if (shelfNotice) shelfNotice.hidden = !!u || st === 'checking';
    var openBtn = $('#openNewShelf');
    if (openBtn) openBtn.hidden = !u;
  }
  function diagLine(k, v) { return '<dt>' + esc(k) + '</dt><dd>' + esc(String(v == null || v === '' ? '—' : v)) + '</dd>'; }
  function paintDiag(extra) {
    var box = $('#spaceDiag'), list = $('#spaceDiagList');
    if (!box || !list) return;
    var d = (window.CZ_AUTH && CZ_AUTH.diagnose) ? CZ_AUTH.diagnose() : null;
    if (!d) { box.hidden = true; return; }
    var rows = [
      ['Nhà cung cấp', d.provider + (d.configured ? ' (đã cấu hình)' : ' (chưa cấu hình)')],
      ['Project Supabase', d.supabaseUrl || '—'],
      ['Trạng thái phiên', { checking: 'đang kiểm tra', 'in': 'đã đăng nhập', out: 'chưa đăng nhập' }[d.state] || d.state],
      ['Tài khoản', d.uid ? (d.name + ' · ' + d.email) : '—'],
      ['Token đang dùng', d.tokenSource],
      ['Máy chủ xác thực', d.verify ? ('LỖI ' + d.verify.status + ' — ' + d.verify.error) : (d.tokenSource === 'worker' ? 'Worker đã xác nhận' : '—')]
    ];
    if (extra) rows.push(['Ghi chú', extra]);
    list.innerHTML = rows.map(function (r) { return diagLine(r[0], r[1]); }).join('');
    box.hidden = false;
  }
  function statusBlock(kind, text, actions, hint) {
    var host = $('#spaceStatus');
    host.innerHTML = '';
    host.setAttribute('data-kind', kind || '');
    var body = document.createElement('span');
    body.className = 'space-session-body';
    body.innerHTML = (kind === 'load' ? '<span class="spin" aria-hidden="true"></span>' : '') + esc(text) + (hint ? '<br><small>' + esc(hint) + '</small>' : '');
    host.appendChild(body);
    if (actions && actions.length) {
      var row = document.createElement('span');
      row.className = 'space-session-actions';
      actions.forEach(function (a) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'btn ghost sm'; b.textContent = a.label;
        b.onclick = a.onClick;
        row.appendChild(b);
      });
      body.appendChild(row);
    }
  }
  function clearStatus() { var host = $('#spaceStatus'); host.innerHTML = ''; host.removeAttribute('data-kind'); }
  async function loadAccount(force) {
    var u = user(), key = (u && u.uid) || '';
    if (!force && !loadFailed && key === identity) { heroFromAccount(); paintSession(); return; }
    identity = key; var ticket = ++epoch;
    releaseAvatarSource(); space = null; selectedShelf = ''; avatar = ''; avatarOff = false;
    $('#shelfList').innerHTML = ''; $('#shelfContent').innerHTML = '';
    $('#profileFields').disabled = true;
    $('#profileName').value = ''; $('#profileBio').value = ''; $('#avatarPreview').innerHTML = '';
    counts();
    if ($('#adjustAvatar')) $('#adjustAvatar').hidden = true;
    if ($('#useAccountAvatar')) $('#useAccountAvatar').hidden = true;
    $('#myPublicLink').hidden = true;
    if ($('#copyProfileLink')) $('#copyProfileLink').hidden = true;
    setMessage($('#profileMessage'), '');
    guestLoginNote(!u);
    if ($('#shelfDialog') && $('#shelfDialog').open) $('#shelfDialog').close();
    paintSession(); cloud();
    if (!u) {
      hero({ name: 'My Space', bio: '', avatar: '', guest: authState() !== 'checking', checking: authState() === 'checking' }, true);
      if (authState() === 'checking') statusBlock('load', 'Đang kiểm tra phiên đăng nhập…');
      else clearStatus();
      paintDiag();
      return;
    }
    statusBlock('load', 'Đang mở không gian của bạn…');
    loadFailed = false;
    try {
      var data = await request('/api/me/space');
      if (ticket !== epoch) return;
      space = data;
      var shown = displayProfile();
      hero(shown, true);
      profileForm(shown);
      cloud(); localData();
      clearStatus();
      paintDiag();
      if (window.CZ_AUTH && CZ_AUTH.applyServerProfile) CZ_AUTH.applyServerProfile(Object.assign({}, space.profile, { avatarOff: shown.avatarOff }));
      await seedProfileIfNeeded();
    } catch (e) {
      if (ticket !== epoch) return;
      loadFailed = true;
      spaceError(e);
    }
  }
  /* Tài khoản mới tinh: hồ sơ máy chủ còn trống (version 0) nhưng tài khoản Google
     đã có tên/ảnh — ghi thẳng vào hồ sơ để hồ sơ công khai và máy khác thấy đúng
     danh tính, thay vì để "Bạn đọc". Chỉ chạy một lần cho mỗi tài khoản. */
  async function seedProfileIfNeeded() {
    var u = user();
    if (!u || !space || space.version !== 0 || seededFor === u.uid) return;
    var name = String(u.name || '').trim().slice(0, 40);
    var pic = String(u.picture || '').trim();
    var wantName = name || 'Bạn đọc';
    var wantPic = /^(data:image\/|https:\/\/)/i.test(pic) ? pic : '';
    if (!name && !wantPic) return;
    /* Worker 1.9.9 đã gieo sẵn đúng danh tính này lúc mở hồ sơ lần đầu thì khỏi
       ghi lại — giữ hồ sơ ở version 0 để tên/ảnh vẫn đi theo tài khoản, chứ không
       bị "đóng băng" thành hồ sơ người dùng đã tự lưu. */
    if (String((space.profile || {}).name || '') === wantName && String((space.profile || {}).avatar || '') === wantPic) { seededFor = u.uid; return; }
    seededFor = u.uid;
    try {
      await mutate({ profile: { name: wantName, bio: String(space.profile.bio || ''), avatar: wantPic, avatarOff: !wantPic && !!(space.profile.avatarOff) } });
      var shown = displayProfile();
      hero(shown, true); profileForm(shown); cloud();
    } catch (e) {
      /* Không ghi được thì thôi — giao diện vẫn đang hiện đúng tên/ảnh tài khoản. */
    }
  }
  function spaceError(e) {
    var msg = (e && e.message) || 'Không tải được dữ liệu.';
    var status = (e && e.status) || 0;
    var actions = [{ label: 'Thử lại', onClick: function () { loadAccount(true); } }];
    var hint = '';
    if (status === 401 || /đăng nhập|Phiên|phiên|token/i.test(msg)) {
      actions.push({ label: 'Kiểm tra lại phiên', onClick: async function () { statusBlock('load', 'Đang kiểm tra lại phiên đăng nhập…'); if (window.CZ_AUTH) await CZ_AUTH.refresh(); loadAccount(true); } });
      actions.push({ label: 'Đăng xuất & đăng nhập lại', onClick: async function () { if (!window.CZ_AUTH) return; try { await CZ_AUTH.logout(); } catch (x) {} CZ_AUTH.login(); } });
      hint = 'Phiên đăng nhập chưa được máy chủ hồ sơ chấp nhận. Bấm “Kiểm tra lại phiên” trước — nếu vẫn lỗi thì đăng xuất rồi đăng nhập lại.';
    } else if (e && e.offline) {
      hint = 'Mạng đang chập chờn, hoặc máy chủ hồ sơ bị chặn.';
    } else if (status === 503) {
      hint = 'Kho hồ sơ chưa được triển khai trên máy chủ — tủ trên thiết bị vẫn dùng bình thường.';
    } else if (status >= 500) {
      hint = 'Lỗi phía máy chủ, thử lại sau ít phút.';
    }
    statusBlock('err', msg, actions, hint);
    paintDiag(msg);
  }
  async function mutate(change) {
    if (!space || busy) throw Error('Vui lòng chờ dữ liệu hoặc thao tác trước hoàn tất.');
    var ticket = epoch; busy = true;
    try {
      var data;
      try {
        data = await request('/api/me/space', 'PUT', Object.assign({ version: space.version }, change));
      } catch (e) {
        if (e && e.status === 409) {
          /* Tab khác đã ghi trước — nạp lại rồi để người dùng bấm lưu lần nữa. */
          await loadAccount(true);
          throw Error('Dữ liệu vừa thay đổi ở tab khác nên lần lưu này chưa áp dụng. Bản nháp của bạn vẫn còn — bấm Lưu lần nữa.');
        }
        throw e;
      }
      if (ticket !== epoch) throw Error('Tài khoản đã thay đổi.');
      space = data; cloud(); return data;
    } finally { busy = false; }
  }
  function picker() {
    var q = CZ.slugify($('#shelfSearch').value);
    var all = CZ.lib().filter(function (n) { return !n.slug.startsWith('private-') && (!q || CZ.slugify(n.title + ' ' + n.author + ' ' + n.couple).includes(q)); });
    var shown = all.slice(0, pickerLimit);
    $('#shelfPicker').innerHTML = shown.map(function (n) {
      return '<label><input type="checkbox" data-book="' + esc(n.slug) + '"' + (selected.has(n.slug) ? ' checked' : '') + '><span>' + esc(n.title) + '<small>' + esc(n.author || '') + '</small></span></label>';
    }).join('') || '<p class="empty">Không tìm thấy truyện nào khớp “' + esc($('#shelfSearch').value) + '”.</p>';
    var info = $('#shelfPickerInfo');
    if (info) {
      info.innerHTML = all.length > shown.length
        ? esc(shown.length + '/' + all.length + ' truyện') + ' <button class="btn ghost sm" type="button" data-picker-more>Hiện thêm</button>'
        : esc(all.length + ' truyện khớp');
    }
    $('#selectedCount').textContent = '(' + selected.size + '/200)';
  }
  function editShelf(shelf, importLocal) {
    if (!space) return;
    editingShelf = shelf ? shelf.id : '';
    selected = new Set(shelf ? shelf.books : importLocal ? CZ.shelfIds().filter(function (s) { return !s.startsWith('private-'); }) : []);
    $('#shelfFormTitle').textContent = shelf ? 'Chỉnh sửa tủ' : (importLocal ? 'Nhập danh sách đã lưu' : 'Tạo tủ truyện');
    $('#shelfName').value = shelf ? shelf.name : (importLocal ? 'Danh sách đã lưu' : '');
    $('#shelfDescription').value = shelf ? shelf.description : '';
    $('#shelfVisibility').value = shelf ? shelf.visibility : 'private';
    $('#shelfSearch').value = ''; pickerLimit = 40;
    setMessage($('#shelfMessage'), '');
    picker(); $('#shelfDialog').showModal(); $('#shelfName').focus();
  }
  async function publicPage() {
    var id = new URLSearchParams(location.search).get('id');
    if (!/^[a-f0-9]{64}$/.test(id || '')) { statusBlock('err', 'Đường dẫn hồ sơ không hợp lệ.'); $('#publicShelves').innerHTML = ''; return; }
    statusBlock('load', 'Đang mở hồ sơ…');
    try {
      var data = await request('/api/profiles/' + id);
      hero(data.profile, false);
      document.title = (data.profile.name || 'Hồ sơ bạn đọc') + ' · ssochuz library';
      var pub = data.shelves || [], books = pub.reduce(function (a, s) { return a + s.books.length; }, 0);
      $('#publicShelves').innerHTML = pub.length
        ? '<p class="space-note space-public-summary">' + CZ.num(pub.length) + ' tủ công khai · ' + CZ.num(books) + ' truyện được giới thiệu</p>' +
          pub.map(function (s) {
            return '<section class="space-panel"><div class="sechead"><div><p class="section-eyebrow">TỦ CÔNG KHAI</p><h3>' + esc(s.name) + '</h3></div><span class="space-count small">' + CZ.num(s.books.length) + ' truyện</span></div>' +
              (s.description ? '<p class="space-bio">' + esc(s.description) + '</p>' : '') + bookGrid(s.books) + '</section>';
          }).join('')
        : '<p class="empty">Bạn đọc này chưa chia sẻ tủ truyện nào.</p>';
      clearStatus();
    } catch (e) { statusBlock('err', e.message, [{ label: 'Thử lại', onClick: publicPage }]); }
  }
  function bindProfile() {
    $('#removeAvatar').onclick = function () {
      releaseAvatarSource(); avatar = ''; avatarOff = true;
      $('#avatarFile').value = '';
      paintAvatar();
      setMessage($('#profileMessage'), 'Ảnh đại diện sẽ được bỏ khi bạn lưu hồ sơ.', '');
    };
    $('#useAccountAvatar').onclick = function () {
      var acc = (user() || {}).picture || '';
      if (!acc) return;
      releaseAvatarSource(); avatar = acc; avatarOff = false; avatarSource = acc;
      $('#avatarFile').value = '';
      paintAvatar();
      setMessage($('#profileMessage'), 'Đã chọn lại ảnh Google. Bấm Lưu hồ sơ để cập nhật.', '');
    };
    $('#adjustAvatar').onclick = async function () {
      if (!avatarSource || !window.CZ_AUTH || !CZ_AUTH.cropAvatar) return;
      var button = this; button.disabled = true;
      try {
        var cropped = await CZ_AUTH.cropAvatar(avatarSource);
        if (cropped) {
          avatar = cropped; avatarSource = cropped; avatarOff = false;
          paintAvatar();
          setMessage($('#profileMessage'), 'Đã căn chỉnh ảnh. Bấm Lưu hồ sơ để cập nhật.', '');
        }
      } catch (err) { setMessage($('#profileMessage'), err.message, 'err'); }
      finally { button.disabled = false; }
    };
    async function takeAvatarFile(file) {
      if (!file) return;
      avatarBusy = true;
      var ticket = epoch;
      try {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw Error('Chỉ nhận ảnh PNG, JPEG hoặc WebP.');
        if (file.size > 8 * 1024 * 1024) throw Error('Ảnh lớn hơn 8 MB — chọn ảnh nhỏ hơn.');
        setMessage($('#profileMessage'), 'Đang xử lý ảnh…');
        releaseAvatarSource();
        avatarSource = URL.createObjectURL(file);
        var image = await createImageBitmap(file);
        var canvas = document.createElement('canvas');
        canvas.width = canvas.height = 256;
        var size = Math.min(image.width, image.height);
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 256, 256);
        ctx.drawImage(image, (image.width - size) / 2, (image.height - size) / 2, size, size, 0, 0, 256, 256);
        image.close();
        if (ticket !== epoch) return;
        avatar = canvas.toDataURL('image/jpeg', 0.85);
        avatarOff = false;
        paintAvatar();
        setMessage($('#profileMessage'), 'Ảnh đã sẵn sàng. ' + ADJUST_HINT, 'ok');
      } catch (err) {
        releaseAvatarSource();
        setMessage($('#profileMessage'), err.message || 'Không đọc được ảnh này.', 'err');
      } finally { avatarBusy = false; }
    }
    $('#avatarFile').onchange = function () {
      var file = this.files && this.files[0];
      takeAvatarFile(file);
      this.value = '';
    };
    var box = $('#avatarEditor'), preview = $('#avatarPreview');
    if (preview) preview.onclick = function () { if (!$('#profileFields').disabled) $('#avatarFile').click(); };
    if (box) {
      ['dragenter', 'dragover'].forEach(function (ev) {
        box.addEventListener(ev, function (e) { e.preventDefault(); box.classList.add('dragging'); });
      });
      ['dragleave', 'drop'].forEach(function (ev) {
        box.addEventListener(ev, function (e) { e.preventDefault(); box.classList.remove('dragging'); });
      });
      box.addEventListener('drop', function (e) {
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (!$('#profileFields').disabled) takeAvatarFile(f);
      });
    }
    ['#profileName', '#profileBio'].forEach(function (sel) {
      var el = $(sel); if (el) el.addEventListener('input', counts);
    });
    $('#profileForm').onsubmit = async function (e) {
      e.preventDefault();
      var button = $('#saveProfile');
      var name = $('#profileName').value.trim();
      if (!name) { setMessage($('#profileMessage'), 'Tên hiển thị không được để trống.', 'err'); $('#profileName').focus(); return; }
      button.disabled = true; button.textContent = 'Đang lưu…';
      try {
        if (avatarBusy) throw Error('Vui lòng chờ xử lý ảnh xong.');
        await mutate({ profile: { name: name, bio: $('#profileBio').value, avatar: avatar, avatarOff: avatarOff && !avatar } });
        releaseAvatarSource(); avatarSource = space.profile.avatar;
        var shown = displayProfile();
        hero(shown, true); profileForm(shown);
        window.CZ_AUTH.applyServerProfile(Object.assign({}, space.profile, { avatarOff: space.profile.avatarOff }));
        setMessage($('#profileMessage'), 'Đã lưu hồ sơ — tên và ảnh này dùng chung cho bình luận và hồ sơ công khai.', 'ok');
        if (CZ.toast) CZ.toast('Đã lưu hồ sơ', 'ok');
      } catch (err) { setMessage($('#profileMessage'), err.message, 'err'); }
      finally { button.disabled = false; button.textContent = 'Lưu hồ sơ'; }
    };
    $('#copyProfileLink').onclick = function () {
      if (!space) return;
      var url = location.origin + '/profile?id=' + space.id;
      if (CZ.copy && CZ.copy(url)) CZ.toast('Đã sao chép liên kết hồ sơ', 'ok');
      else if (CZ.toast) CZ.toast(url, '');
    };
  }
  function bindTabs() {
    document.querySelectorAll('[data-space-tab]').forEach(function (b) {
      b.onclick = function () { location.hash = b.dataset.spaceTab; };
      b.onkeydown = function (e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); moveTab(1); }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); moveTab(-1); }
        else if (e.key === 'Home') { e.preventDefault(); location.hash = 'shelves'; document.querySelector('[data-space-tab]').focus(); }
        else if (e.key === 'End') { e.preventDefault(); var all = document.querySelectorAll('[data-space-tab]'); location.hash = all[all.length - 1].dataset.spaceTab; all[all.length - 1].focus(); }
      };
    });
  }
  async function init() {
    CZ.mountShell({ active: 'space' });
    await CZ.registry();
    CZ._setLib();
    if (isPublic) { await publicPage(); CZ.reveal(); return; }
    localData(); tab(); bindTabs(); bindProfile();
    hero({ name: 'My Space', bio: '', avatar: '', guest: authState() !== 'checking', checking: authState() === 'checking' }, true);
    paintSession();
    window.addEventListener('hashchange', function () { tab(false); });
    window.addEventListener('storage', function () { localData(); });
    window.addEventListener('pageshow', function () { localData(); loadAccount(false); });
    if (window.CZ_AUTH && CZ_AUTH.onAuth) {
      CZ_AUTH.onAuth(function () {
        heroFromAccount(); paintSession(); guestLoginNote(!user());
        loadAccount(false);
      });
    }
    if (window.CZ_AUTH && CZ_AUTH.onReady) CZ_AUTH.onReady(function () { paintSession(); paintDiag(); loadAccount(false); });
    $('#spaceLogin').onclick = async function () {
      this.disabled = true;
      statusBlock('load', 'Đang mở trang đăng nhập…');
      try { await CZ_AUTH.login(); clearStatus(); }
      catch (e) { statusBlock('err', 'Chưa đăng nhập được. Vui lòng thử lại.', [{ label: 'Thử lại', onClick: function () { $('#spaceLogin').click(); } }]); }
      finally { this.disabled = false; paintSession(); }
    };
    var profileLogin = $('#profileLogin');
    if (profileLogin) profileLogin.onclick = async function () { profileLogin.disabled = true; try { await CZ_AUTH.login(); } catch (e) {} finally { profileLogin.disabled = false; } };
    var localShelfEl = $('#localShelf');
    if (localShelfEl) localShelfEl.onclick = function (e) {
      var b = e.target.closest('[data-remove-local]');
      if (b) { CZ.toggleShelf({ slug: b.dataset.removeLocal }); localData(); }
    };
    $('#spaceHistory').onclick = async function (e) {
      var b = e.target.closest('[data-forget]');
      if (!b) return;
      var n = CZ.findLib(b.dataset.forget);
      if (!n) return;
      if (!await CZ.confirm('Xoá tiến độ đọc của “' + n.title + '” trên thiết bị này?', 'Xoá tiến độ')) return;
      [n.slug, n.postId].filter(Boolean).forEach(function (k) {
        try { localStorage.removeItem('ssochuz-prog-' + k); localStorage.removeItem('ssochuz-when-' + k); } catch (err) {}
      });
      localData();
      if (CZ.toast) CZ.toast('Đã xoá tiến độ của bộ này');
    };
    $('#clearHistory').onclick = async function () {
      if (!await CZ.confirm('Xoá lịch sử và tiến độ đọc trên thiết bị này? Thống kê và tủ truyện vẫn giữ nguyên.', 'Xoá lịch sử')) return;
      CZ.lib().forEach(function (n) {
        [n.slug, n.postId].filter(Boolean).forEach(function (k) {
          try { localStorage.removeItem('ssochuz-prog-' + k); localStorage.removeItem('ssochuz-when-' + k); } catch (err) {}
        });
      });
      localData();
      if (CZ.toast) CZ.toast('Đã xoá lịch sử đọc trên thiết bị này');
    };
    $('#newShelf').onclick = function () { editShelf(); };
    var openNewBtn = $('#openNewShelf');
    if (openNewBtn) openNewBtn.onclick = function () { editShelf(); };
    var shelfLoginBtn = $('#shelfLogin');
    if (shelfLoginBtn) shelfLoginBtn.onclick = async function () { shelfLoginBtn.disabled = true; try { await CZ_AUTH.login(); } catch (e) {} finally { shelfLoginBtn.disabled = false; } };
    $('#importShelf').onclick = function () { editShelf(null, true); };
    $('#shelfList').onclick = function (e) {
      var b = e.target.closest('[data-shelf]');
      if (b) { selectedShelf = b.dataset.shelf; cloud(); }
    };
    $('#shelfContent').onclick = async function (e) {
      var shelf = space && space.shelves.find(function (s) { return s.id === selectedShelf; });
      if (!shelf) return;
      var rm = e.target.closest('[data-remove-book]');
      if (rm) {
        var book = CZ.findLib(rm.dataset.removeBook);
        var books = shelf.books.filter(function (s) { return s !== rm.dataset.removeBook; });
        try {
          await mutate({ shelf: { id: shelf.id, name: shelf.name, description: shelf.description, visibility: shelf.visibility, books: books } });
          if (CZ.toast) CZ.toast('Đã bỏ “' + ((book && book.title) || rm.dataset.removeBook) + '” khỏi tủ');
        } catch (err) { statusBlock('err', err.message, [{ label: 'Tải lại dữ liệu', onClick: function () { loadAccount(true); } }]); }
        return;
      }
      if (e.target.closest('[data-edit-shelf]')) editShelf(shelf);
      if (e.target.closest('[data-delete-shelf]') && await CZ.confirm('Xoá tủ “' + shelf.name + '”? Truyện gốc không bị xoá.', 'Xoá tủ')) {
        try {
          await mutate({ deleteShelf: shelf.id });
          if (CZ.toast) CZ.toast('Đã xoá tủ “' + shelf.name + '”');
        } catch (err) { statusBlock('err', err.message, [{ label: 'Tải lại dữ liệu', onClick: function () { loadAccount(true); } }]); }
      }
    };
    $('#closeShelf').onclick = function () { $('#shelfDialog').close(); };
    $('#shelfSearch').oninput = function () { pickerLimit = 40; picker(); };
    $('#shelfPicker').onchange = function (e) {
      var b = e.target.closest('[data-book]');
      if (!b) return;
      if (b.checked) selected.add(b.dataset.book); else selected.delete(b.dataset.book);
      $('#selectedCount').textContent = '(' + selected.size + '/200)';
    };
    $('#shelfPickerInfo').onclick = function (e) {
      if (e.target.closest('[data-picker-more]')) { pickerLimit += 40; picker(); }
    };
    $('#shelfForm').onsubmit = async function (e) {
      e.preventDefault();
      var button = $('#saveShelf');
      var name = $('#shelfName').value.trim();
      if (!name) { setMessage($('#shelfMessage'), 'Tên tủ không được để trống.', 'err'); $('#shelfName').focus(); return; }
      button.disabled = true; button.textContent = 'Đang lưu…';
      try {
        if (selected.size > 200) throw Error('Mỗi tủ chứa tối đa 200 truyện.');
        var before = space.shelves.map(function (s) { return s.id; });
        await mutate({ shelf: { id: editingShelf || undefined, name: name, description: $('#shelfDescription').value, visibility: $('#shelfVisibility').value, books: [...selected] } });
        if (!editingShelf) selectedShelf = (space.shelves.find(function (s) { return !before.includes(s.id); }) || {}).id;
        cloud();
        $('#shelfDialog').close();
        if (CZ.toast) CZ.toast(editingShelf ? 'Đã cập nhật tủ' : 'Đã tạo tủ mới', 'ok');
      } catch (err) { setMessage($('#shelfMessage'), err.message, 'err'); }
      finally { button.disabled = false; button.textContent = 'Lưu tủ truyện'; }
    };
    loadAccount(true);
    CZ.reveal();
  }
  init().catch(function (e) { spaceError(e); });
})();
