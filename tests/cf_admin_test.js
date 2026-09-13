/* Kiểm thử trang quản trị mới (KV) bằng jsdom + Worker giả lập */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const errors = [], calls = [];
const KV = {};                      /* "KV" giả lập */
let registryJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/registry.json'), 'utf8'));

const admin = fs.readFileSync(path.join(ROOT, 'admin.js'), 'utf8');
const czdata = fs.readFileSync(path.join(ROOT, 'cz-data.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8')
  .replace('<script src="/cz-config.js"></script>', () => '<script>window.CZ_API="https://cms.test";</script>')
  .replace('<script src="/cz-data.js"></script>', () => '<script>' + czdata + '</script>')
  .replace('<script src="/admin.js"></script>', () => '<script>' + admin + '</script>');

const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://chuseoz.pages.dev/admin',
  beforeParse(w) {
    w.addEventListener('error', e => errors.push('win: ' + ((e.error && e.error.stack) || e.message)));
    w.console.error = (...a) => errors.push('cerr: ' + a.join(' '));
    w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
    w.scrollTo = () => {};
    w.confirm = () => true;
    w.prompt = () => null;
    w.fetch = (url, opt = {}) => {
      url = String(url); opt = opt || {}; calls.push((opt.method || 'GET') + ' ' + url.replace('https://cms.test', ''));
      const ret = (b, ok, st) => Promise.resolve({ ok: ok !== false, status: st || 200, json: () => Promise.resolve(b), text: () => Promise.resolve(JSON.stringify(b)) });
      try {
        if (url.includes('cms.test')) {
          const needAuth = !/\/api\/health/.test(url);
          if (needAuth && (!opt.headers || opt.headers['x-admin-key'] !== 'KEY123')) return ret({ ok: false, error: 'sai hoặc thiếu X-Admin-Key' }, false, 401);
          const p = url.replace('https://cms.test', '').split('?')[0];
          if (p === '/api/health') return ret({ ok: true, version: '1.1.0', kv: true, books: Object.keys(KV).filter(k => k.startsWith('book:')).length, novels: registryJson.lib.length, regRev: registryJson.rev, lastWrite: '2026-09-12T18:00:00Z' });
          if (p === '/api/whoami') return ret({ ok: true, role: 'admin' });
          if (p === '/api/registry') {
            if (opt.method === 'PUT') { registryJson = JSON.parse(opt.body); KV.registry = true; return ret({ ok: true }); }
            return KV.registry || true ? ret(registryJson) : ret({ ok: false, error: 'trống' }, false, 404);
          }
          const mb = p.match(/^\/api\/book\/(.+)$/);
          if (mb) {
            const slug = decodeURIComponent(mb[1]);
            if (opt.method === 'PUT') { KV[slug] = JSON.parse(opt.body); return ret({ ok: true }); }
            if (opt.method === 'DELETE') { delete KV[slug]; return ret({ ok: true, deleted: slug }); }
            return KV[slug] ? ret(KV[slug]) : ret({ ok: false, error: 'chưa có' }, false, 404);
          }
          if (p === '/api/import') {
            const b = JSON.parse(opt.body || '{}');
            const bk = KV[b.slug] || { title: b.slug, slug: b.slug, chapters: [] };
            bk.chapters = bk.chapters || [];
            bk.chapters.push({ t: 'Chương từ Blogger ' + (bk.chapters.length + 1), html: '<p>nội dung lấy từ blogspot</p>' });
            KV[b.slug] = bk;
            return ret({ ok: true, added: bk.chapters.slice(-1)[0].t, chapters: bk.chapters.length, url: b.url || 'https://chuseoz.blogspot.com/2026/09/bai-moi.html', title: 'Bài mới' });
          }
          if (p === '/api/sync') return ret({ ok: true, cards: 62, changed: 4, rev: '2026-09-12 18:30' });
          if (p === '/api/stats') return ret({ ok: false, error: 'firestore 403' }, false, 503);
          if (p === '/api/stats/refresh') return ret({ ok: true });
          return ret({ ok: false, error: 'not found' }, false, 404);
        }
        if (url.includes('firestore.googleapis.com')) return ret({ error: { message: '403' } }, false, 403);
        if (url.startsWith('/data/registry.json')) return ret(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/registry.json'), 'utf8')));
        const m2 = url.match(/\/data\/book\/([\w.\-]+)\.json/);
        if (m2) return ret(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/book', m2[1] + '.json'), 'utf8')));
        return ret({}, false, 404);
      } catch (e) { errors.push('fetch ' + url + ' ' + e.message); return ret({}, false, 500); }
    };
  }
});
const win = dom.window, doc = win.document;
const $ = s => doc.querySelector(s), $$ = s => [...doc.querySelectorAll(s)];
const txt = s => { const e = $(s); return e ? e.textContent.trim().replace(/\s+/g, ' ') : '<null>'; };
const val = s => { const e = $(s); return e ? e.value : '<null>'; };
const set = (s, v) => { const e = $(s); e.value = v; e.dispatchEvent(new win.Event('input', { bubbles: true })); };
const click = s => { const e = typeof s === 'string' ? $(s) : s; if (!e) return 'MISSING ' + s; e.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); return 'ok'; };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const out = {};
  await wait(400);
  out.errors0 = errors.slice(0, 4);
  out.connectVisible = !$('#scConnect').classList.contains('hide');
  // sai khoá
  set('#inApi', 'https://cms.test'); set('#inKey', 'SAI'); click('#btnConnect'); await wait(200);
  out.badKey = txt('#msgConn');
  // đúng khoá + URL dán thiếu https:// (phải tự thêm)
  set('#inApi', 'cms.test'); set('#inKey', 'KEY123'); click('#btnConnect'); await wait(600);
  out.connected = { scApp: !$('#scApp').classList.contains('hide'), chip: txt('#chConn'), data: txt('#chData') };
  out.rows = $$('#tb tr[data-slug]').length;
  out.health = txt('#health').slice(0, 120);

  // đăng chương nhanh
  click($$('#tabs button')[1]); await wait(120);
  out.quickPane = !$('#pane-quick').classList.contains('hide');
  const first = $('#qkBook').options[0].value;
  $('#qkBook').value = first;
  set('#qkBody', 'Đoạn một của chương mới.\n\nĐoạn hai có <b>thẻ</b> lạ.');
  out.qkInfo = txt('#qkInfo');
  click('#qkPost'); await wait(500);
  out.posted = { msg: txt('#msg').slice(0, 90), kvBook: first, chapters: KV[first] ? KV[first].chapters.length : 0 };
  const it = registryJson.lib.find(n => n.slug === first);
  out.postedMeta = { chapters: it.chapters, countLabel: it.countLabel, updated: it.updated, status: it.status };

  // lấy chương thẳng từ Blogger
  set('#qkUrl', 'https://chuseoz.blogspot.com/2026/09/bai-moi.html');
  click('#qkFetch'); await wait(400);
  out.importBlogger = { msg: txt('#msg').slice(0, 90), chapters: KV[first] ? KV[first].chapters.length : 0,
                        last: KV[first] ? KV[first].chapters.slice(-1)[0].t : '' };

  // sửa metadata
  click($$('#tabs button')[0]); await wait(80);
  click($$('#tb [data-edit]')[0]); await wait(400);
  out.edit = { head: txt('#edHead'), chRows: $$('#chList .i').length, chN: txt('#chN') };
  set('#fTitle', 'Tên Đã Sửa'); set('#fStatus', 'Hoàn thành'); set('#fSlug', 'ten-da-sua');
  click('#btnSaveMeta'); await wait(300);
  out.savedMeta = { msg: txt('#msg').slice(0, 80), slug: registryJson.lib.some(n => n.slug === 'ten-da-sua'), title: registryJson.lib.some(n => n.title === 'Tên Đã Sửa') };
  // sửa chương
  click($$('#chList .i')[0]); await wait(60);
  const beforeBody = val('#chBody').length;
  set('#chBody', val('#chBody') + '<p>thêm đoạn</p>');
  click('#chSave'); await wait(300);
  out.savedChapter = { before: beforeBody, after: (KV['ten-da-sua'] || KV[first] || { chapters: [{}] }).chapters.slice(-1)[0].html.length, msg: txt('#msg').slice(0, 60) };

  // truyện mới
  click($$('#tabs button')[2]); await wait(80);
  set('#nTitle', 'Truyện Thử Nghiệm'); 
  out.newSlug = val('#nSlug');
  set('#nAuthor', 'Tác giả Test'); set('#nChap', 'Nội dung chương một.');
  click('#btnNew'); await wait(400);
  out.newNovel = { msg: txt('#msg').slice(0, 80), inLib: registryJson.lib.some(n => n.slug === 'truyen-thu-nghiem'), book: !!KV['truyen-thu-nghiem'] };

  // hàng loạt
  click($$('#tabs button')[0]); await wait(80);
  const cks = $$('#tb [data-ck]').slice(0, 3);
  cks.forEach(c => { c.checked = true; c.dispatchEvent(new win.Event('change', { bubbles: true })); });
  out.bulk = { area: !$('#bulkArea').classList.contains('hide'), n: txt('#selN') };
  $('#bulkStatus').value = 'Sắp ra mắt';
  click('#bulkApply'); await wait(300);
  out.bulkDone = { msg: txt('#msg').slice(0, 60), n: registryJson.lib.filter(n => n.status === 'Sắp ra mắt').length };

  // cài đặt + lịch + slide
  click($$('#tabs button')[5]); await wait(80);
  out.settings = { slides: $$('#slidePick [data-slide]').length, sched: val('#sSched').slice(0, 60) };
  click('#sSave'); await wait(300);
  out.settingsSaved = txt('#msg').slice(0, 60);

  // số liệu (Firebase bị chặn)
  click($$('#tabs button')[4]); await wait(400);
  out.stats = { state: txt('#stState').slice(0, 90), tiles: txt('#stTiles').slice(0, 60) };

  // đồng bộ Blogger
  click($$('#tabs button')[5]); await wait(60);
  click('#setSync'); await wait(400);
  out.sync = txt('#msg').slice(0, 90);

  out.methods = [...new Set(calls.map(c => c.split(' ')[0]))].join(',');
  out.errors1 = errors.slice(0, 6);
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})();
