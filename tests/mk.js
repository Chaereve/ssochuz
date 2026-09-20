/* Nạp 1 trang HTML và nhúng các script ngoài (cz-config.js, cz-app.js, cz-home.js…)
   vào để jsdom chạy được. Trả về {dom, win, doc, errors} */
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = require('path').join(__dirname, '..');

function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
function inlineAll(html) {
  return html.replace(/<script src="\/([A-Za-z0-9_.\-]+)(?:\?[^"]*)?"><\/script>/g, (m, f) => {
    const p = path.join(ROOT, f);
    return fs.existsSync(p) ? '<script>' + fs.readFileSync(p, 'utf8') + '</script>' : m;
  });
}
function inline(html, files) {
  files.forEach(f => {
    const re = new RegExp('<script src="/' + f.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&') + '(?:\\?[^"]*)?"><\\/script>');
    const code = read(f);
    html = html.replace(re, () => '<script>' + code + '</script>');
  });
  return html;
}
/* setup(w): chạy TRƯỚC khi script của trang chạy — dùng để giả lập phiên đăng nhập
   (localStorage) hoặc cấu hình (window.CZ_*) mà không phải sửa mã nguồn. */
function page(file, { url = 'https://ssochuz.pages.dev/', fetch, config = {}, files = ['cz-config.js', 'cz-app.js'], setup = null, css = false } = {}) {
  let html = read(file);
  html = inline(html, files);
  html = inlineAll(html);
  /* css: true → nhúng luôn cz.css vào trang để jsdom tính được getComputedStyle.
     Cần cho các bài kiểm tra "ẩn/hiện": luật [hidden] của trình duyệt là kiểu
     user-agent nên bị `display:` của class đè — đúng cái bẫy đã làm khối "hãy
     đăng nhập" hiện sai trên My Space. */
  if (css) html = html.replace(/<link rel="stylesheet" href="\/(cz\.css)(?:\?[^"]*)?">/g, () => '<style>' + read('cz.css') + '</style>');
  if (config.CZ_API !== undefined) {
    html = html.replace(/window\.CZ_API\s*=\s*(window\.CZ_API\s*\|\|\s*)?'[^']*';/,
      "window.CZ_API=" + JSON.stringify(config.CZ_API) + ";");
  }
  if (config.CZ_STATS_DIRECT !== undefined) {
    html = html.replace(/window\.CZ_STATS_DIRECT\s*=\s*(true|false);/,
      "window.CZ_STATS_DIRECT=" + (config.CZ_STATS_DIRECT ? 'true' : 'false') + ";");
  }
  const errors = [];
  /* jsdom không cài đặt việc chuyển trang thật (location.href = …) — đó là giới hạn của
     môi trường chạy thử, không phải lỗi của web, nên không tính vào errors */
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => {});
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url, virtualConsole: vc,
    beforeParse(w) {
      w.addEventListener('error', e => errors.push('win: ' + ((e.error && e.error.stack) || e.message)));
      w.console.error = (...a) => errors.push('cerr: ' + a.join(' '));
      w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
      w.Element.prototype.scrollIntoView = function () {};
      w.scrollTo = () => {};
      w.IntersectionObserver = w.IntersectionObserver || class { observe() {} unobserve() {} disconnect() {} };
      w.ResizeObserver = w.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
      if (fetch) w.fetch = fetch;
      if (setup) setup(w);
    }
  });
  return { dom, win: dom.window, doc: dom.window.document, errors };
}

/* fetch giả: phục vụ /data/*.json thật, tuỳ chọn thêm /api/* */
function dataFetch({ api = null, apiBase = 'https://cms.test', stats = null, log = null } = {}) {
  return (url, opt = {}) => {
    url = String(url); opt = opt || {};
    if (log) log.push((opt.method || 'GET') + ' ' + url);
    const ret = (b, ok, st) => Promise.resolve({
      ok: ok !== false, status: st || 200,
      json: () => Promise.resolve(b), text: () => Promise.resolve(typeof b === 'string' ? b : JSON.stringify(b))
    });
    try {
      if (url.includes('firestore.googleapis.com')) {
        return stats ? ret(JSON.parse(fs.readFileSync(stats, 'utf8'))) : ret({ error: { code: 403 } }, false, 403);
      }
      if (url.includes(apiBase)) {
        const m = url.replace(apiBase, '').split('?')[0];
        if (api) { const r = api(m, opt); if (r !== undefined) return r; }
        return ret({ ok: false, error: 'chưa cấu hình api trong test' }, false, 404);
      }
      if (url.startsWith('/data/registry.json')) return ret(JSON.parse(read('data/registry.json')));
      /* bảng tên chương cho ô tìm nhanh — do tools/build_site.mjs sinh ra thư mục gốc */
      if (url.split('?')[0].endsWith('/chuong-index.json')) {
        const p = path.join(ROOT, 'chuong-index.json');
        if (fs.existsSync(p)) return ret(JSON.parse(fs.readFileSync(p, 'utf8')));
        return ret({ ok: false }, false, 404);
      }
      const m2 = url.match(/\/data\/book\/([\w.\-]+)\.json/);
      if (m2) {
        const p = path.join(ROOT, 'data/book', decodeURIComponent(m2[1]) + '.json');
        if (fs.existsSync(p)) return ret(JSON.parse(fs.readFileSync(p, 'utf8')));
        return ret({ ok: false }, false, 404);
      }
      return ret({}, false, 404);
    } catch (e) { return ret({ err: String(e) }, false, 500); }
  };
}
module.exports = { page, dataFetch, read, ROOT };
