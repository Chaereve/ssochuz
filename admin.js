/* admin.js — quản trị chuseoz trên Cloudflare Pages.
   Dữ liệu = file JSON trong repo GitHub (data/registry.json + data/book/<slug>.json).
   Mỗi nút lưu = commit qua GitHub Contents API → Pages tự deploy. */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var LS_REPO = 'cz_cf_repo', LS_PAT = 'cz_cf_pat', LS_BR = 'cz_cf_br';
  var REG = null, REG_SHA = null, cur = null, curSha = null, curCh = -1;

  function msg(t, err) {
    var m = $('#msg'); m.textContent = t; m.className = 'msg' + (err ? ' err' : '');
    m.style.display = 'block'; clearTimeout(m._t);
    m._t = setTimeout(function () { m.style.display = 'none'; }, 6000);
  }
  function cfg() {
    return { repo: (localStorage.getItem(LS_REPO) || '').trim(),
             pat: (localStorage.getItem(LS_PAT) || '').trim(),
             br: (localStorage.getItem(LS_BR) || 'main').trim() || 'main' };
  }
  function b64(s) { return btoa(unescape(encodeURIComponent(s))); }
  function unb64(s) { return decodeURIComponent(escape(atob(s.replace(/\n/g, '')))); }

  function gh(path, opt) {
    var c = cfg();
    return fetch('https://api.github.com/repos/' + c.repo + '/contents/' + path,
      Object.assign({ headers: { 'Authorization': 'Bearer ' + c.pat, 'Accept': 'application/vnd.github+json' } }, opt || {}));
  }
  function readJSON(path) {
    return gh(path).then(function (r) {
      if (!r.ok) return null;
      return r.json().then(function (j) { return { data: JSON.parse(unb64(j.content)), sha: j.sha }; });
    });
  }
  function writeJSON(path, obj, message) {
    return readJSON(path).then(function (curF) {
      var body = { message: message, content: b64(JSON.stringify(obj)), branch: cfg().br };
      if (curF) body.sha = curF.sha;
      return gh(path, { method: 'PUT', body: JSON.stringify(body) });
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (e) { throw new Error(e.message || 'commit lỗi'); });
      return true;
    });
  }
  function delFile(path, message) {
    return readJSON(path).then(function (curF) {
      if (!curF) return false;
      return gh(path, { method: 'DELETE', body: JSON.stringify({ message: message, sha: curF.sha, branch: cfg().br }) });
    });
  }
  function slugify(t) {
    return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function today() { return new Date().toISOString().slice(0, 10); }

  /* ---------- đăng nhập ---------- */
  function login() {
    localStorage.setItem(LS_REPO, $('#inRepo').value.trim());
    localStorage.setItem(LS_PAT, $('#inPat').value.trim());
    localStorage.setItem(LS_BR, $('#inBr').value.trim() || 'main');
    var c = cfg();
    if (!c.repo || !c.pat) { msg('Thiếu repo hoặc token.', 1); return; }
    fetch('https://api.github.com/user', { headers: { 'Authorization': 'Bearer ' + c.pat } })
      .then(function (r) { if (!r.ok) throw new Error('token không hợp lệ'); return r.json(); })
      .then(function (u) { localStorage.setItem('cz_cf_user', u.login); enter(); })
      .catch(function (e) { msg('Đăng nhập thất bại: ' + e.message, 1); });
  }
  function enter() {
    $('#secLogin').classList.add('hide');
    $('#secDash').classList.remove('hide');
    $('#btnLogout').classList.remove('hide');
    $('#who').textContent = '@' + (localStorage.getItem('cz_cf_user') || '') + ' · ' + cfg().repo;
    loadReg();
  }
  function loadReg() {
    msg('Đang tải dữ liệu từ repo…');
    readJSON('data/registry.json').then(function (r) {
      if (!r) throw new Error('không thấy data/registry.json — repo đã nối đúng Pages chưa?');
      REG = r.data; REG_SHA = r.sha; renderList();
      var g = ((REG.settings || {}).giscus) || {};
      $('#gRepo').value = g.repo || ''; $('#gRepoId').value = g.repoId || '';
      msg('Đã tải registry rev ' + (REG.rev || '?') + ' · ' + REG.lib.length + ' truyện.');
    }).catch(function (e) { msg(e.message, 1); });
  }

  /* ---------- danh sách ---------- */
  function renderList() {
    var q = ($('#q').value || '').toLowerCase();
    var rows = REG.lib.filter(function (n) {
      return !q || (n.title + ' ' + (n.author || '')).toLowerCase().indexOf(q) >= 0;
    });
    $('#tb').innerHTML = rows.map(function (n, i) {
      return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(n.title) + '</b>' + (n.is18 ? ' <span class="pill">18+</span>' : '') +
        '<br><span class="sm">/truyen/' + esc(n.slug) + '/</span></td>' +
        '<td>' + (n.chapters || 0) + '</td><td><span class="pill">' + esc(n.status || '') + '</span></td>' +
        '<td class="sm">' + esc(n.updated || '') + '</td>' +
        '<td><button data-e="' + esc(n.slug) + '">Mở</button> <button class="dan" data-d="' + esc(n.slug) + '">Xoá</button></td></tr>';
    }).join('');
    Array.prototype.forEach.call($('#tb').querySelectorAll('[data-e]'), function (b) {
      b.onclick = function () { openEdit(b.getAttribute('data-e')); };
    });
    Array.prototype.forEach.call($('#tb').querySelectorAll('[data-d]'), function (b) {
      b.onclick = function () { delNovel(b.getAttribute('data-d')); };
    });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---------- sửa truyện ---------- */
  function openEdit(slug) {
    readJSON('data/book/' + slug + '.json').then(function (r) {
      if (!r) { msg('Không đọc được book ' + slug, 1); return; }
      cur = r.data; curSha = r.sha; curCh = -1;
      var n = REG.lib.find(function (x) { return x.slug === slug; }) || {};
      $('#edHead').textContent = 'Sửa: ' + cur.title;
      $('#fTitle').value = cur.title || ''; $('#fSlug').value = cur.slug || '';
      $('#fAuthor').value = cur.author || n.author || ''; $('#fCouple').value = n.couple || '';
      $('#fYear').value = n.year || ''; $('#fStatus').value = n.status || 'Đang cập nhật';
      $('#fCount').value = n.countLabel || ''; $('#f18').value = n.is18 ? '1' : '0';
      $('#fAdapt').value = n.adapt || ''; $('#fAdaptName').value = n.adaptName || '';
      $('#fThumb').value = n.thumb || ''; $('#fSyn').value = n.syn || '';
      $('#paneList').classList.add('hide'); $('#paneEdit').classList.remove('hide');
      renderChList(); openCh(cur.chapters.length - 1);
    }).catch(function (e) { msg(e.message, 1); });
  }
  function renderChList() {
    $('#chCount').textContent = cur.chapters.length;
    $('#chList').innerHTML = cur.chapters.map(function (c, i) {
      return '<div data-i="' + i + '" class="' + (i === curCh ? 'on' : '') + '"><span class="n">' + (i + 1) + '</span>' + esc(c.t || '(chưa có tựa)') + '</div>';
    }).join('') || '<div class="sm" style="padding:10px">Chưa có chương nào.</div>';
    Array.prototype.forEach.call($('#chList').querySelectorAll('[data-i]'), function (d) {
      d.onclick = function () { openCh(+d.getAttribute('data-i')); };
    });
  }
  function openCh(i) {
    curCh = i;
    var c = cur.chapters[i] || { t: '', html: '' };
    $('#chEdHead').textContent = 'Nội dung chương ' + (i + 1);
    $('#chTitle').value = c.t || ''; $('#chHtml').value = c.html || '';
    renderChList();
  }
  function text2html() {
    var t = $('#chHtml').value;
    if (/<p[\s>]/i.test(t)) { msg('Văn bản đã có thẻ <p>, không cần đổi.'); return; }
    $('#chHtml').value = t.split(/\n{2,}/).map(function (p) {
      return '<p>' + esc(p.trim()).replace(/\n/g, '<br>') + '</p>';
    }).join('\n');
    msg('Đã chuyển thành thẻ <p>.');
  }
  function saveBook() {
    if (curCh >= 0 && cur.chapters[curCh]) {
      cur.chapters[curCh] = { t: $('#chTitle').value.trim() || ('Chương ' + (curCh + 1)), html: $('#chHtml').value };
    }
    writeJSON('data/book/' + cur.slug + '.json', cur, 'admin: cập nhật chương "' + cur.title + '"')
      .then(function () { return syncRegistryEntry(false); })
      .then(function () { msg('Đã commit! Pages deploy trong ~1 phút.'); loadReg(); })
      .catch(function (e) { msg(e.message, 1); });
  }
  function syncRegistryEntry(metaChanged) {
    var n = REG.lib.find(function (x) { return x.slug === cur.slug; });
    if (!n) return Promise.resolve();
    n.chapters = cur.chapters.length;
    n.countLabel = $('#fCount').value.trim() || (n.status === 'Hoàn thành' ? cur.chapters.length + '/' + cur.chapters.length : cur.chapters.length + '/—');
    n.updated = today();
    if (metaChanged) {
      n.title = $('#fTitle').value.trim() || n.title;
      n.author = $('#fAuthor').value.trim(); n.couple = $('#fCouple').value.trim();
      n.year = $('#fYear').value.trim(); n.status = $('#fStatus').value;
      n.is18 = $('#f18').value === '1'; n.adapt = $('#fAdapt').value || null;
      n.adaptName = $('#fAdaptName').value.trim();
      var th = $('#fThumb').value.trim(); if (th) { n.thumb = th; n.slide = th; }
      n.syn = $('#fSyn').value.trim();
    }
    REG.rev = today();
    return writeJSON('data/registry.json', REG, 'admin: cập nhật registry "' + n.title + '"');
  }
  function saveMeta() {
    var oldSlug = cur.slug, newSlug = slugify($('#fSlug').value || $('#fTitle').value);
    cur.title = $('#fTitle').value.trim() || cur.title;
    cur.author = $('#fAuthor').value.trim(); cur.couple = $('#fCouple').value.trim();
    var p = Promise.resolve();
    if (newSlug && newSlug !== oldSlug) {
      cur.slug = newSlug;
      p = writeJSON('data/book/' + newSlug + '.json', cur, 'admin: đổi slug ' + oldSlug + ' → ' + newSlug)
        .then(function () { return delFile('data/book/' + oldSlug + '.json', 'admin: xoá slug cũ ' + oldSlug); })
        .then(function () {
          var n = REG.lib.find(function (x) { return x.slug === oldSlug; });
          if (n) { n.slug = newSlug; n.url = '/truyen/' + newSlug + '/'; }
        });
    }
    p.then(function () { return syncRegistryEntry(true); })
      .then(function () { msg('Đã lưu thông tin. Deploy ~1 phút.'); loadReg(); })
      .catch(function (e) { msg(e.message, 1); });
  }
  function delNovel(slug) {
    if (!confirm('Xoá hẳn "' + slug + '" khỏi site?')) return;
    delFile('data/book/' + slug + '.json', 'admin: xoá truyện ' + slug)
      .then(function () {
        REG.lib = REG.lib.filter(function (n) { return n.slug !== slug; });
        REG.slides = (REG.slides || []).filter(function (n) { return n.slug !== slug; });
        REG.rev = today();
        return writeJSON('data/registry.json', REG, 'admin: registry bỏ ' + slug);
      })
      .then(function () { msg('Đã xoá. Deploy ~1 phút.'); loadReg(); })
      .catch(function (e) { msg(e.message, 1); });
  }

  /* ---------- thêm chương hàng loạt ---------- */
  function bulkPaste() {
    var t = prompt('Dán khối chương. Mỗi chương ngăn cách bởi dòng chỉ chứa ---CHAP---;\ndòng ĐẦU mỗi khối là tựa chương, phần còn lại là nội dung (văn bản thô).');
    if (!t) return;
    var blocks = t.split(/^\s*---CHAP---\s*$/m);
    var added = 0;
    blocks.forEach(function (b) {
      b = b.trim(); if (!b) return;
      var nl = b.indexOf('\n');
      var title = (nl < 0 ? b : b.slice(0, nl)).trim();
      var body = nl < 0 ? '' : b.slice(nl + 1);
      var html = /<p[\s>]/i.test(body) ? body : body.split(/\n{2,}/).map(function (p) {
        return '<p>' + esc(p.trim()).replace(/\n/g, '<br>') + '</p>';
      }).join('\n');
      cur.chapters.push({ t: title || ('Chương ' + (cur.chapters.length + 1)), html: html });
      added++;
    });
    renderChList(); openCh(cur.chapters.length - 1);
    msg('Đã thêm ' + added + ' chương vào bản nháp — bấm "Lưu toàn bộ truyện" để commit.');
  }

  /* ---------- truyện mới ---------- */
  function newNovel() {
    var title = $('#nTitle').value.trim();
    if (!title) { msg('Thiếu tên truyện.', 1); return; }
    var slug = slugify($('#nSlug').value || title);
    if (REG.lib.some(function (n) { return n.slug === slug; })) { msg('Slug đã tồn tại.', 1); return; }
    var chapHtml = $('#nChap').value;
    var chapters = [];
    if (chapHtml.trim()) {
      chapters.push({ t: 'Chương 1', html: /<p[\s>]/i.test(chapHtml) ? chapHtml :
        chapHtml.split(/\n{2,}/).map(function (p) { return '<p>' + esc(p.trim()).replace(/\n/g, '<br>') + '</p>'; }).join('\n') });
    }
    var book = { title: title, slug: slug, author: $('#nAuthor').value.trim(), couple: '', chapters: chapters };
    var thumb = $('#nThumb').value.trim();
    var entry = {
      title: title, slug: slug, url: '/truyen/' + slug + '/', author: book.author, couple: '',
      year: String(new Date().getFullYear()), status: $('#nStatus').value,
      count: chapters.length + '/' + (chapters.length || '—'), chapters: chapters.length,
      is18: false, thumb: thumb, slide: thumb, countLabel: chapters.length + '/' + (chapters.length || '—'),
      updated: today(), syn: $('#nSyn').value.trim(), adapt: null, adaptName: '', postId: ''
    };
    writeJSON('data/book/' + slug + '.json', book, 'admin: tạo truyện ' + slug)
      .then(function () { REG.lib.unshift(entry); REG.rev = today();
        return writeJSON('data/registry.json', REG, 'admin: registry thêm ' + slug); })
      .then(function () { msg('Đã tạo "' + title + '". Deploy ~1 phút.'); loadReg(); })
      .catch(function (e) { msg(e.message, 1); });
  }

  /* ---------- cài đặt + sao lưu ---------- */
  function saveSet() {
    REG.settings = REG.settings || {};
    REG.settings.giscus = { repo: $('#gRepo').value.trim(), repoId: $('#gRepoId').value.trim() };
    REG.rev = today();
    writeJSON('data/registry.json', REG, 'admin: cập nhật cài đặt site')
      .then(function () { msg('Đã lưu cài đặt.'); }).catch(function (e) { msg(e.message, 1); });
  }
  function backup() {
    msg('Đang gộp sao lưu…');
    Promise.all(REG.lib.map(function (n) { return readJSON('data/book/' + n.slug + '.json'); }))
      .then(function (rs) {
        var books = {};
        rs.forEach(function (r, i) { if (r) books[REG.lib[i].slug] = r.data; });
        var blob = new Blob([JSON.stringify({ registry: REG, books: books }, null, 1)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'chuseoz-backup-' + today() + '.json';
        a.click(); msg('Đã tải bản sao lưu.');
      }).catch(function (e) { msg(e.message, 1); });
  }

  /* ---------- tab & nút ---------- */
  function tab(name) {
    ['List', 'New', 'Set', 'Help'].forEach(function (t) {
      $('#pane' + t).classList.add('hide'); $('#tab' + t).classList.remove('on');
    });
    $('#pane' + name).classList.remove('hide'); $('#tab' + name).classList.add('on');
  }
  document.addEventListener('DOMContentLoaded', function () {
    $('#inRepo').value = localStorage.getItem(LS_REPO) || '';
    $('#inBr').value = localStorage.getItem(LS_BR) || 'main';
    $('#btnLogin').onclick = login;
    $('#btnLogout').onclick = function () { localStorage.removeItem(LS_PAT); location.reload(); };
    $('#tabList').onclick = function () { tab('List'); };
    $('#tabNew').onclick = function () { tab('New'); };
    $('#tabSet').onclick = function () { tab('Set'); };
    $('#tabHelp').onclick = function () { tab('Help'); };
    $('#q').oninput = renderList;
    $('#btnRefresh').onclick = loadReg;
    $('#btnBackup').onclick = backup;
    $('#btnBackList').onclick = function () { $('#paneEdit').classList.add('hide'); $('#paneList').classList.remove('hide'); };
    $('#btnSaveMeta').onclick = saveMeta;
    $('#btnSaveBook').onclick = saveBook;
    $('#btnChAdd').onclick = function () { cur.chapters.push({ t: 'Chương ' + (cur.chapters.length + 1), html: '<p></p>' }); renderChList(); openCh(cur.chapters.length - 1); };
    $('#btnChPaste').onclick = bulkPaste;
    $('#btnChText2Html').onclick = text2html;
    $('#btnChDel').onclick = function () {
      if (curCh < 0 || !confirm('Xoá chương ' + (curCh + 1) + '?')) return;
      cur.chapters.splice(curCh, 1); renderChList(); openCh(Math.min(curCh, cur.chapters.length - 1));
    };
    $('#btnNew').onclick = newNovel;
    $('#btnSaveSet').onclick = saveSet;
    $('#nTitle').oninput = function () { if (!$('#nSlug').dataset.lock) $('#nSlug').value = slugify($('#nTitle').value); };
    $('#nSlug').oninput = function () { $('#nSlug').dataset.lock = '1'; };
    if (localStorage.getItem(LS_PAT) && localStorage.getItem(LS_REPO)) enter();
  });
})();
