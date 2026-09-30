#!/usr/bin/env node
/* ============================================================================
   audit_a11y.mjs · MILESTONE C (D3): ĐO LIGHTHOUSE TĨNH & TRỢ NĂNG AXE-CORE
   ----------------------------------------------------------------------------
   Chạy kiểm toán tự động trên toàn bộ 6 trang công khai (8 trạng thái giao diện)
   và 16 màn của trang Quản trị (admin v2 + Tiptap 3):
     1. Trợ năng (Accessibility): chạy `axe-core` (WCAG 2.0/2.1 A & AA + Best
        Practices) trên DOM thật sau khi script + dữ liệu đã dựng xong.
     2. Chỉ số Lighthouse tĩnh (Performance / Best Practices / SEO):
        - kiểm tra thẻ `<html lang="vi">`, `<meta charset>`, `<meta viewport>`,
          `<title>`, `<meta name="description">` (trừ trang 404/admin),
          `<main id="main">`, liên kết bỏ qua điều hướng (`a.skip[href="#main"]`)
        - đo dung lượng tải ban đầu (raw + gzip) của `index.html`, `truyen.html`
          và `admin.html` so với chuẩn mạng di động.
   ========================================================================== */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const { page, dataFetch, read } = require(path.join(ROOT, 'tests/mk.js'));
const axeSource = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function runAxe(win, label, context) {
  if (!win.axe) win.eval(axeSource);
  const res = await win.axe.run(context || win.document, {
    rules: {
      /* jsdom không có bộ dựng hình (canvas/layout) nên tắt color-contrast */
      'color-contrast': { enabled: false },
    },
  });
  return {
    label,
    passes: res.passes.length,
    incomplete: res.incomplete.length,
    violations: res.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 5).map((n) => ({
        target: n.target,
        html: n.html.slice(0, 140),
      })),
    })),
  };
}

function checkLighthouseMeta(doc, file, { requireDesc = true, requireSkip = true } = {}) {
  const issues = [];
  const lang = doc.documentElement.getAttribute('lang');
  if (lang !== 'vi') issues.push(`${file}: thiếu <html lang="vi"> (thấy ${lang})`);
  if (!doc.querySelector('meta[charset]')) issues.push(`${file}: thiếu <meta charset>`);
  const vp = doc.querySelector('meta[name="viewport"]');
  if (!vp || !/width=device-width/.test(vp.getAttribute('content') || '')) {
    issues.push(`${file}: thiếu <meta name="viewport" content="width=device-width...">`);
  }
  const title = (doc.title || '').trim();
  if (!title) issues.push(`${file}: thiếu <title>`);
  if (requireDesc) {
    const desc = doc.querySelector('meta[name="description"]');
    if (!desc || !(desc.getAttribute('content') || '').trim()) {
      issues.push(`${file}: thiếu <meta name="description">`);
    }
  }
  if (!doc.querySelector('main#main, main')) issues.push(`${file}: thiếu vùng chính <main>`);
  if (requireSkip && !doc.querySelector('a.skip[href="#main"]')) {
    issues.push(`${file}: thiếu liên kết bỏ qua điều hướng a.skip[href="#main"]`);
  }
  return issues;
}

function gzipSize(relPath) {
  const buf = fs.readFileSync(path.join(ROOT, relPath));
  return { rawKb: +(buf.length / 1024).toFixed(1), gzipKb: +(zlib.gzipSync(buf).length / 1024).toFixed(1) };
}

(async () => {
  const fetchPublic = dataFetch();
  const axeReports = [];
  const metaIssues = [];

  /* ---- 1. Các trang công khai ---- */
  const publicScenarios = [
    { file: 'index.html', url: 'https://ssochuz.pages.dev/', label: 'index.html (Thư viện)', requireDesc: true, requireSkip: true },
    { file: 'truyen.html', url: 'https://ssochuz.pages.dev/truyen.html?s=third-person', label: 'truyen.html (Chi tiết truyện)', requireDesc: true, requireSkip: true },
    { file: 'truyen.html', url: 'https://ssochuz.pages.dev/truyen.html?s=third-person&c=1', label: 'truyen.html (Đọc chương 1)', requireDesc: true, requireSkip: true },
    { file: 'my-space.html', url: 'https://ssochuz.pages.dev/my-space.html', label: 'my-space.html (Tủ sách cá nhân)', requireDesc: true, requireSkip: true },
    { file: 'profile.html', url: 'https://ssochuz.pages.dev/profile.html?u=admin', label: 'profile.html (Hồ sơ dịch giả)', requireDesc: true, requireSkip: true },
    { file: 'guide.html', url: 'https://ssochuz.pages.dev/guide.html', label: 'guide.html (Hướng dẫn)', requireDesc: true, requireSkip: true },
    { file: '404.html', url: 'https://ssochuz.pages.dev/404.html', label: '404.html (Trang không tìm thấy)', requireDesc: false, requireSkip: false },
  ];

  for (const sc of publicScenarios) {
    const p = page(sc.file, { url: sc.url, fetch: fetchPublic });
    await wait(250);
    metaIssues.push(...checkLighthouseMeta(p.doc, sc.label, { requireDesc: sc.requireDesc, requireSkip: sc.requireSkip }));
    axeReports.push(await runAxe(p.win, sc.label));
    p.win.close();
  }

  /* ---- 2. Trang Quản trị (cổng đăng nhập + 14 tab + soạn chương Tiptap 3) ---- */
  const registry = JSON.parse(read('data/registry.json'));
  const slug = 'third-person';
  const book = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/book', slug + '.json'), 'utf8'));
  const jsonRes = (body, ok = true, status = 200) => Promise.resolve({
    ok, status,
    headers: { get: (n) => /content-type/i.test(n) ? 'application/json' : '' },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
  const apiFetch = (url) => {
    const u = new URL(String(url), 'https://ssochuz.pages.dev');
    if (u.pathname === '/api/health') return jsonRes({ ok: true, adminConfigured: true, kv: true });
    if (u.pathname === '/api/whoami') return jsonRes({ ok: true, role: 'admin', permissions: ['*'] });
    if (u.pathname === '/api/registry') return jsonRes(registry);
    if (u.pathname === '/api/admin/kv') return jsonRes({ ok: true, groups: [], writesToday: 2, lastReset: '2026-09-30' });
    if (u.pathname === '/api/admin/reports') return jsonRes({ ok: true, count: 0, items: [] });
    if (u.pathname === '/api/admin/comments') return jsonRes({ ok: true, count: 0, comments: [] });
    if (u.pathname === '/api/admin/users') return jsonRes({ ok: true, count: 1, users: [{ uid: 'u1', displayName: 'Reader', email: 'r@test', role: 'user', status: 'active' }] });
    if (u.pathname === '/api/admin/roles') return jsonRes({ ok: true, roles: { admin: ['*'] }, assignments: [{ uid: 'u1', email: 'r@test', role: 'editor' }] });
    if (u.pathname === '/api/admin/logs') return jsonRes({ ok: true, count: 1, logs: [{ ts: '2026-09-30T10:00:00Z', action: 'save_chapter', target: slug, actor: 'admin' }] });
    if (u.pathname === '/api/admin/featured') return jsonRes({ ok: true, featured: [slug], banners: [] });
    if (u.pathname === '/api/admin/pages') return jsonRes({ ok: true, pages: [{ slug: 'about', title: 'Giới thiệu', html: '<p>Test</p>' }] });
    if (u.pathname === '/api/admin/settings') return jsonRes({ ok: true, settings: { siteTitle: 'ssochuz' } });
    if (u.pathname === '/api/admin/media') return jsonRes({ ok: true, count: 1, items: [{ id: 'img1', url: '/api/img/img1', size: 1024, created: '2026-09-30T10:00:00Z' }] });
    if (u.pathname === '/api/book/' + slug) return jsonRes(book);
    return jsonRes({ ok: true });
  };

  const pAdmin = page('admin.html', {
    fetch: apiFetch,
    url: 'https://ssochuz.pages.dev/admin.html',
    config: { CZ_API: 'https://cms.test' },
  });
  await wait(350);
  metaIssues.push(...checkLighthouseMeta(pAdmin.doc, 'admin.html', { requireDesc: false, requireSkip: false }));
  axeReports.push(await runAxe(pAdmin.win, 'admin.html (Cổng đăng nhập)'));

  const input = (el, v) => { el.value = v; el.dispatchEvent(new pAdmin.win.Event('input', { bubbles: true })); };
  const click = (el) => el.dispatchEvent(new pAdmin.win.MouseEvent('click', { bubbles: true }));
  input(pAdmin.doc.querySelector('#v2Api'), 'https://cms.test');
  input(pAdmin.doc.querySelector('#v2Key'), 'test-key');
  await wait(80);
  pAdmin.doc.querySelector('.v2connect').dispatchEvent(new pAdmin.win.Event('submit', { bubbles: true, cancelable: true }));
  await wait(350);

  const tabs = [...pAdmin.doc.querySelectorAll('button[data-tab]')].map((b) => b.getAttribute('data-tab'));
  for (const t of tabs) {
    const b = pAdmin.doc.querySelector(`button[data-tab="${t}"]`);
    if (!b) continue;
    click(b);
    await wait(120);
    const ctx = t === 'overview' ? pAdmin.doc : (pAdmin.doc.querySelector('main') || pAdmin.doc);
    axeReports.push(await runAxe(pAdmin.win, `admin.html (tab: ${t})`, ctx));
  }

  click(pAdmin.doc.querySelector('button[data-tab="list"]'));
  await wait(120);
  const row = [...pAdmin.doc.querySelectorAll('.v2book-table tbody tr')].find((tr) => tr.textContent.includes(slug));
  click(row.querySelector('.v2actions button'));
  await wait(250);
  axeReports.push(await runAxe(pAdmin.win, 'admin.html (Soạn truyện & chương Tiptap 3)', pAdmin.doc.querySelector('#pane-edit') || pAdmin.doc));
  pAdmin.win.close();

  /* ---- 3. Đo dung lượng tải trang ban đầu (Lighthouse Performance) ---- */
  const payloads = {
    homeInitial: {
      files: ['index.html', 'cz.css', 'cz-config.js', 'cz-app.js', 'cz-auth.js', 'cz-home.js'],
      maxGzipKb: 140,
    },
    readerInitial: {
      files: ['truyen.html', 'cz.css', 'cz-config.js', 'cz-app.js', 'cz-auth.js', 'cz-story.js'],
      maxGzipKb: 160,
    },
    adminInitial: {
      files: ['admin.html', 'cz.css', 'admin.css', 'cz-config.js', 'admin.js'],
      maxGzipKb: 190,
    },
  };
  const payloadSummary = {};
  for (const [k, cfg] of Object.entries(payloads)) {
    let raw = 0, gz = 0;
    for (const f of cfg.files) {
      const s = gzipSize(f);
      raw += s.rawKb;
      gz += s.gzipKb;
    }
    raw = +raw.toFixed(1);
    gz = +gz.toFixed(1);
    payloadSummary[k] = { rawKb: raw, gzipKb: gz, maxGzipKb: cfg.maxGzipKb };
    if (gz > cfg.maxGzipKb) {
      metaIssues.push(`Payload ${k} vượt ngưỡng gzip ${cfg.maxGzipKb} kB: ${gz} kB`);
    }
  }

  const failedAxe = axeReports.filter((r) => r.violations.length > 0);
  const summary = {
    auditedViews: axeReports.length,
    totalPasses: axeReports.reduce((a, r) => a + r.passes, 0),
    axeViolations: failedAxe,
    lighthouseMetaIssues: metaIssues,
    initialPayloads: payloadSummary,
  };
  console.log(JSON.stringify(summary, null, 1));
  assert.deepStrictEqual(metaIssues, [], 'Lỗi Lighthouse tĩnh: ' + metaIssues.join(' · '));
  assert.deepStrictEqual(failedAxe, [], 'Lỗi trợ năng axe-core: ' + JSON.stringify(failedAxe));
  console.log(`Đạt: ${axeReports.length} màn giao diện đạt 0 lỗi axe-core và đạt chuẩn Lighthouse tĩnh.`);
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
