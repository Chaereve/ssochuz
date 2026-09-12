/* Nạp 1 trang HTML và nhúng các script ngoài (cz-config.js, cz-data.js, admin.js) vào
   để jsdom chạy được. Trả về {html, dom, win, doc} */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = require('path').join(__dirname, '..');

function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
function inlineAll(html) {
  return html.replace(/<script src="\/([A-Za-z0-9_.\-]+)"><\/script>/g, (m, f) => {
    const p = path.join(ROOT, f);
    return fs.existsSync(p) ? '<script>' + fs.readFileSync(p, 'utf8') + '</script>' : m;
  });
}
function inline(html, files) {
  files.forEach(f => {
    const tag = '<script src="/' + f + '"></script>';
    const code = read(f);
    html = html.replace(tag, () => '<script>' + code + '</script>');
  });
  return html;
}
function page(file, { url = 'https://chuseoz.pages.dev/', fetch, config = {}, files = ['cz-config.js', 'cz-data.js'] } = {}) {
  let html = read(file);
  html = inline(html, files);
  html = inlineAll(html);
  if (config.CZ_API !== undefined || config.CZ_STATS_DIRECT !== undefined) {
    html = html.replace(/window\.CZ_API\s*=\s*window\.CZ_API\s*\|\|\s*'';/,
      "window.CZ_API=" + JSON.stringify(config.CZ_API || '') + ";");
  }
  const errors = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url,
    beforeParse(w) {
      w.addEventListener('error', e => errors.push('win: ' + ((e.error && e.error.stack) || e.message)));
      w.console.error = (...a) => errors.push('cerr: ' + a.join(' '));
      w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
      w.Element.prototype.scrollIntoView = function () {};
      w.scrollTo = () => {};
      w.IntersectionObserver = w.IntersectionObserver || class { observe() {} unobserve() {} disconnect() {} };
      w.ResizeObserver = w.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
      if (fetch) w.fetch = fetch;
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
