/* t_admin_flow.mjs · Hồi kiểm các lỗi admin đã sửa (chạy Worker THẬT + KV RAM,
   mở admin.html mới + admin-real.js thật, bấm chuột qua jsdom):
   A  Tạo bộ  → tab Chương tự trỏ bộ VỪA TẠO (không cần chọn lại), Lưu chương
                ghi vào bộ mới, KHÔNG ghi nhầm lib[0] (hometown).
   B  Đổi slug → tab Chương tự trỏ slug MỚI, Lưu chương PUT slug mới (200),
                KHÔNG PUT slug cũ.
   C  Đối soát Lưu chương của bộ có sẵn vẫn ghi KV đúng.
   D  Tạo bộ → ghim vào Series + lịch → Lưu trang chủ → Xoá bộ (strong confirm):
                lib / schedule.items / editorChoice / settings.editorChoice đều
                hết slug đã xoá, state trỏ sang bộ thay thế, KHÔNG PUT vào bộ
                đã xoá, Lưu chương ghi vào bộ thay thế.
   E1 Đổi slug bộ ĐANG Ở LỊCH → schedule.items cập nhật slug mới, giữ nguyên
                days/title, book KV chuyển key.
   E2 Đổi slug bake → CẢ HAI editorChoice và settings.editorChoice cập nhật
                (parity với books.js renameReferences), số lượng không đổi. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const worker = (await import(pathToFileURL(path.join(ROOT, 'worker', 'cms.js')).href)).default;

class MemKV {
  constructor() { this.m = new Map(); }
  async get(k, opt) {
    const v = this.m.get(k); if (!v) return null;
    if (opt && opt.type === 'json') { try { return JSON.parse(v); } catch (e) { return null; } }
    return v;
  }
  async getWithMetadata(k, opt) {
    const v = this.m.get(k); if (!v) return { value: null, metadata: null };
    return { value: opt && opt.type === 'json' ? JSON.parse(v) : v, metadata: null };
  }
  async put(k, value) { this.m.set(k, String(value)); }
  async delete(k) { this.m.delete(k); }
  async list({ prefix = '', limit = 1000, cursor } = {}) {
    const all = [...this.m.keys()].filter(k => k.startsWith(prefix)).sort();
    const start = cursor ? all.indexOf(cursor) + 1 : 0;
    const keys = all.slice(start, start + limit).map(name => ({ name, metadata: null }));
    const done = start + limit >= all.length;
    return { keys, list_complete: done, cursor: done ? undefined : all[start + limit - 1] };
  }
}
const env = {
  ADMIN_KEY: 'MOCK', CZ_KV: new MemKV(), ALLOW_ORIGIN: '*',
  BLOG: 'https://chuseoz.blogspot.com',
  SESSION_SECRET: 'mock-session-secret-dai-hon-32-ky-tu',
  ADMIN_EMAILS: 'owner@example.com',
};
const regSeed = JSON.parse(R('data/registry.json'));
await env.CZ_KV.put('registry', JSON.stringify(regSeed));
for (const f of fs.readdirSync(path.join(ROOT, 'data/book'))) {
  if (!f.endsWith('.json')) continue;
  await env.CZ_KV.put('book:' + f.slice(0, -5), R('data/book/' + f));
}
await env.CZ_KV.put('_last', new Date().toISOString());

const BASE = 'https://cms.test';
const net = [];
async function wFetch(url, opts = {}) {
  const u = String(url);
  const ent = { m: opts.method || 'GET', u, full: opts.body ? String(opts.body) : '' };
  net.push(ent);
  const req = new Request(u, {
    method: ent.m, headers: opts.headers || {},
    body: ['GET', 'HEAD'].includes(ent.m) ? undefined : opts.body,
  });
  try {
    const res = await worker.fetch(req, env, { waitUntil() {} });
    ent.status = res.status;
    return res;
  } catch (e) { ent.err = String(e); throw e; }
}

const rawHtml = R('admin.html');
const html = rawHtml.replace(/<script src="\/admin-real\.js[^"]*"><\/script>/, '');
const realJs = R('admin-real.js');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push('jsdomError: ' + ((e && e.message) || e)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
const dom = new JSDOM(html, {
  url: 'https://ssochuz.pages.dev/admin',
  runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
});
const w = dom.window;
w.addEventListener('error', e => errors.push('window.error: ' + ((e && e.message) || e)));
w.fetch = wFetch;
w.URL.createObjectURL = () => 'blob:fake';
w.URL.revokeObjectURL = () => {};
w.scrollTo = () => {};
w.HTMLElement.prototype.scrollIntoView = function () {};
w.localStorage.setItem('cz_kv_api', BASE);
w.sessionStorage.setItem('cz_kv_key', 'MOCK');
w.eval(realJs);

const D = w.document;
const $ = s => D.querySelector(s);
const S = () => w.CZ_MOCKUP.state;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const click = sel => { const e = $(sel); if (!e) throw new Error('không thấy ' + sel); e.click(); };
function setVal(id, v) {
  const e = D.getElementById(id); if (!e) throw new Error('không thấy #' + id);
  e.value = v;
  e.dispatchEvent(new w.Event('input', { bubbles: true }));
  e.dispatchEvent(new w.Event('change', { bubbles: true }));
}
async function nav(id) { w.CZ_MOCKUP.navigate(id); await sleep(90); }
/* xác nhận strong: gõ đúng cụm rồi bấm nút chính (modal KHÔNG mở ⇒ no-op) */
function confirmStrong(phrase) {
  const input = $('#confirmPhrase');
  if (input) { input.value = phrase; input.dispatchEvent(new w.Event('input', { bubbles: true })); }
  const btn = $('[data-act="confirm-ok"]'); if (btn && !btn.disabled) btn.click();
}
async function until(fn, ms = 3000, step = 100) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(step); }
  return fn();
}
const reg = async () => JSON.parse(await env.CZ_KV.get('registry'));
const bad = []; let pass = 0;
const ok = (cond, msg) => { if (cond) pass++; else bad.push(msg); console.log((cond ? '✓ ' : '✗ ') + msg); };

(async () => {
  await sleep(400);   /* boot() → auto-connect (cz_kv_api + cz_kv_key) */
  ok(S().conn === 'online', 'boot online, books=' + S().books.length);

  /* ========== A · TẠO BỘ → TAB CHƯƠNG (KHÔNG CHỌN LẠI) ========== */
  console.log('\n=== A · TẠO BỘ ===');
  await nav('them-bo');
  setVal('nb-t', 'Bộ Repro QA');
  setVal('nb-slug', 'bo-repro-qa');
  setVal('nb-a', 'Tác giả QA');
  setVal('nb-chapter', 'Chương đầu repro.');
  click('[data-act="submit-new"]');
  await sleep(600);
  const rA = await reg();
  ok(!!rA.lib.find(m => m.slug === 'bo-repro-qa'), 'A: registry có bộ mới');
  ok(S().chapterBook === 'bo-repro-qa',
    `A: chapterBook = bộ VỪA TẠO (thấy ${S().chapterBook})`);
  await nav('chuong');
  const selA = $('[data-role="chapter-book"]');
  ok(selA && selA.value === 'bo-repro-qa', `A: dropdown Chương = bộ mới (thấy ${selA && selA.value})`);
  const edA = $('#editor');
  ok(edA && edA.getAttribute('data-book') === 'bo-repro-qa',
    `A: editor data-book = bộ mới (thấy ${edA && edA.getAttribute('data-book')})`);
  ok(S().chapters.length === 1, `A: danh sách chương bộ mới = 1 (thấy ${S().chapters.length})`);
  if (edA) edA.innerHTML = '<p>Nội dung A sau tạo.</p>';
  const markA = net.length;
  click('[data-act="save-chapter"]');
  await sleep(500);
  const putsA = net.slice(markA).filter(x => x.m === 'PUT');
  ok(putsA.some(x => x.u.includes('/api/book/bo-repro-qa/chapter') && x.status === 200),
    'A: Lưu chương ghi vào bộ MỚI (200)');
  ok(!putsA.some(x => x.u.includes('/api/book/hometown-romance-special/chapter')),
    'A: KHÔNG ghi nhầm lib[0] (hometown)');

  /* ========== B · ĐỔI SLUG → TAB CHƯƠNG → LƯU CHƯƠNG ========== */
  console.log('\n=== B · ĐỔI SLUG bo-repro-qa → bo-repro-doi ===');
  w.selectBook('bo-repro-qa');
  await sleep(300);
  await nav('sua-bo');
  setVal('eb-t', 'Bộ Repro Đổi');
  setVal('eb-slug', 'bo-repro-doi');
  click('[data-act="save-edit"]');
  await sleep(300);
  confirmStrong('ĐỔI SLUG');
  await sleep(500);
  const rB = await reg();
  ok(!!rB.lib.find(m => m.slug === 'bo-repro-doi'), 'B: registry có slug mới');
  ok(!rB.lib.find(m => m.slug === 'bo-repro-qa'), 'B: registry hết slug cũ');
  ok(!(await env.CZ_KV.get('book:bo-repro-qa')), 'B: book slug cũ đã xoá trên KV');
  ok(!!(await env.CZ_KV.get('book:bo-repro-doi')), 'B: book ghi ở slug mới');
  ok(S().chapterBook === 'bo-repro-doi',
    `B: chapterBook = slug MỚI (thấy ${S().chapterBook})`);
  await nav('chuong');
  const selB = $('[data-role="chapter-book"]');
  ok(selB && selB.value === 'bo-repro-doi', `B: dropdown Chương = slug mới (thấy ${selB && selB.value})`);
  const edB = $('#editor');
  ok(edB && edB.getAttribute('data-book') === 'bo-repro-doi',
    `B: editor data-book = slug mới (thấy ${edB && edB.getAttribute('data-book')})`);
  if (edB) edB.innerHTML = '<p>Nội dung sau đổi slug.</p>';
  const markB = net.length;
  click('[data-act="save-chapter"]');
  await sleep(500);
  const putsB = net.slice(markB).filter(x => x.m === 'PUT');
  ok(putsB.some(x => x.u.includes('/api/book/bo-repro-doi/chapter') && x.status === 200),
    'B: Lưu chương ghi vào slug MỚI (200)');
  ok(!putsB.some(x => x.u.includes('/api/book/bo-repro-qa/chapter')),
    'B: KHÔNG PUT vào slug CŨ sau khi đổi');
  const kvB = JSON.parse(await env.CZ_KV.get('book:bo-repro-doi'));
  ok(/sau đổi slug/.test(((kvB.chapters || [])[0] || {}).html || ''), 'B: KV slug mới có nội dung lưu');

  /* ========== C · ĐỐI SOÁT: LƯU CHƯƠNG BỘ CÓ SẴN ========== */
  console.log('\n=== C · LƯU CHƯƠNG BỘ CÓ SẴN ===');
  w.selectBook('bake-love-feelings');
  await sleep(300);
  await nav('chuong');
  const edC = $('#editor');
  ok(edC && edC.getAttribute('data-book') === 'bake-love-feelings',
    `C: editor data-book = bake (thấy ${edC && edC.getAttribute('data-book')})`);
  ok(S().chapters.length > 0, `C: danh sách chương bake > 0 (thấy ${S().chapters.length})`);
  if (edC) edC.innerHTML = '<p>Noi dung repro C.</p>';
  const markC = net.length;
  click('[data-act="save-chapter"]');
  await sleep(500);
  const kvC = JSON.parse(await env.CZ_KV.get('book:bake-love-feelings'));
  const idxC = S().activeChapter;
  ok(/Noi dung repro C/.test(((kvC.chapters || [])[idxC] || {}).html || ''), 'C: KV có nội dung repro C');
  ok(net.slice(markC).some(x => x.m === 'PUT' && x.u.includes('/api/book/bake-love-feelings/chapter') && x.status === 200),
    'C: PUT chương bake (200)');

  /* ========== D · TẠO BỘ → GHIM SERIES/LỊCH → LƯU TRANG CHỦ → XOÁ BỘ ========== */
  console.log('\n=== D · XOÁ BỘ + DỌN THAM CHIẾU ===');
  await nav('them-bo');
  setVal('nb-t', 'Bộ Xoá QA');
  setVal('nb-slug', 'bo-xoa-qa');
  setVal('nb-a', 'Tác giả QA');
  setVal('nb-chapter', 'Chương D.');
  click('[data-act="submit-new"]');
  await sleep(600);
  let rD = await reg();
  ok(!!rD.lib.find(m => m.slug === 'bo-xoa-qa'), 'D: tạo bộ bo-xoa-qa');
  ok(S().chapterBook === 'bo-xoa-qa', `D: chapterBook = bo-xoa-qa (thấy ${S().chapterBook})`);
  /* ghim vào Series + lịch rồi Lưu trang chủ ⇒ registry thật chứa 4 tham chiếu */
  S().picked.push('bo-xoa-qa');
  S().schedule.push({ d: 'Thứ 8', b: 'bo-xoa-qa', c: 'QA dòng lịch' });
  await nav('homepage-cms');
  click('[data-act="save-homepage"]');
  await sleep(600);
  rD = await reg();
  ok(rD.editorChoice.includes('bo-xoa-qa'), 'D: editorChoice chứa bộ mới sau Lưu trang chủ');
  ok(rD.settings.editorChoice.includes('bo-xoa-qa'), 'D: settings.editorChoice chứa bộ mới');
  ok((rD.schedule.items || []).some(x => x && x.slug === 'bo-xoa-qa'), 'D: schedule.items chứa bộ mới');
  /* lọc thư viện → bấm Xoá → strong confirm đúng slug */
  await nav('thu-vien');
  S().lib.q = 'bo-xoa-qa';
  w.render();
  const delBtn = $('[data-act="delete-book"][data-id="bo-xoa-qa"]');
  ok(!!delBtn, 'D: thấy nút Xoá sau khi lọc thư viện');
  const markD = net.length;
  if (delBtn) delBtn.click();
  await sleep(120);
  confirmStrong('bo-xoa-qa');
  await sleep(700);
  rD = await reg();
  ok(!rD.lib.find(m => m.slug === 'bo-xoa-qa'), 'D: lib hết bộ đã xoá');
  ok(!(rD.schedule.items || []).some(x => x && x.slug === 'bo-xoa-qa'), 'D: schedule.items hết slug đã xoá');
  ok(!rD.editorChoice.includes('bo-xoa-qa'), 'D: editorChoice hết slug đã xoá');
  ok(!rD.settings.editorChoice.includes('bo-xoa-qa'), 'D: settings.editorChoice hết slug đã xoá');
  ok(rD.editorChoice.length === 12 && rD.settings.editorChoice.length === 12,
    `D: 2 mảng Series giữ nguyên 12 phần tử (thấy ${rD.editorChoice.length}/${rD.settings.editorChoice.length})`);
  ok(!(await env.CZ_KV.get('book:bo-xoa-qa')), 'D: book KV bo-xoa-qa đã bị DELETE');
  ok(S().selectedBook !== 'bo-xoa-qa' && S().chapterBook !== 'bo-xoa-qa',
    `D: state trỏ sang bộ thay thế (selected=${S().selectedBook}, chapterBook=${S().chapterBook})`);
  ok(!S().picked.includes('bo-xoa-qa'), 'D: state.picked sạch');
  ok(!S().schedule.some(x => x.b === 'bo-xoa-qa'), 'D: state.schedule sạch');
  await nav('chuong');
  const edD = $('#editor');
  ok(edD && edD.getAttribute('data-book') !== 'bo-xoa-qa',
    `D: editor data-book ≠ bộ đã xoá (thấy ${edD && edD.getAttribute('data-book')})`);
  if (edD) edD.innerHTML = '<p>Nội dung sau khi xoá bộ.</p>';
  click('[data-act="save-chapter"]');
  const gotHome = await until(() => net.slice(markD).some(x => x.m === 'PUT' && x.u.includes('/api/book/hometown-romance-special/chapter')));
  ok(gotHome, 'D: Lưu chương sau xoá ghi vào bộ thay thế (hometown)');
  const dPuts = net.slice(markD).filter(x => x.m === 'PUT' && x.u.includes('/api/book/bo-xoa-qa'));
  ok(dPuts.length === 0, `D: KHÔNG PUT vào bộ đã xoá (thấy ${dPuts.length})`);

  /* ========== E1 · ĐỔI SLUG BỘ Ở LỊCH → schedule.items CẬP NHẬT ========== */
  console.log('\n=== E1 · ĐỔI SLUG BỘ TRONG LỊCH ===');
  const e1Old = regSeed.schedule.items[0].slug;
  const e1New = 'bo-lich-qa';
  const e1Days = regSeed.schedule.items[0].days;
  const e1Title = regSeed.schedule.items[0].title;
  w.selectBook(e1Old);
  await sleep(300);
  await nav('sua-bo');
  setVal('eb-slug', e1New);
  click('[data-act="save-edit"]');
  await sleep(700);
  const r1 = await reg();
  const it1 = (r1.schedule.items || []).find(x => x && x.slug === e1New);
  ok(!!it1, `E1: schedule.items có slug mới (${e1New})`);
  ok(it1 && it1.days === e1Days, `E1: days giữ nguyên (thấy ${it1 && it1.days})`);
  ok(it1 && it1.title === e1Title, `E1: title giữ nguyên (thấy ${it1 && it1.title})`);
  ok(!(r1.schedule.items || []).some(x => x && x.slug === e1Old), 'E1: schedule.items hết slug cũ');
  ok(!!r1.lib.find(m => m.slug === e1New) && !r1.lib.find(m => m.slug === e1Old), 'E1: lib đổi slug');
  ok(!!(await env.CZ_KV.get('book:' + e1New)), 'E1: book ghi ở key mới');
  ok(!(await env.CZ_KV.get('book:' + e1Old)), 'E1: book key cũ đã DELETE');

  /* ========== E2 · ĐỔI SLUG bake → CẢ 2 MẢNG editorChoice ========== */
  console.log('\n=== E2 · ĐỔI SLUG bake → 2 MẢNG SERIES ===');
  const e2Old = 'bake-love-feelings', e2New = 'bake-love-qa-doi';
  w.selectBook(e2Old);
  await sleep(300);
  await nav('sua-bo');
  setVal('eb-slug', e2New);
  click('[data-act="save-edit"]');
  await sleep(700);
  const r2 = await reg();
  ok(r2.editorChoice.includes(e2New) && !r2.editorChoice.includes(e2Old),
    'E2: editorChoice đổi sang slug mới');
  ok(r2.settings.editorChoice.includes(e2New) && !r2.settings.editorChoice.includes(e2Old),
    'E2: settings.editorChoice đổi sang slug mới');
  ok(r2.editorChoice.length === 12 && r2.settings.editorChoice.length === 12,
    `E2: 2 mảng giữ 12 phần tử (thấy ${r2.editorChoice.length}/${r2.settings.editorChoice.length})`);
  ok(!!(await env.CZ_KV.get('book:' + e2New)) && !(await env.CZ_KV.get('book:' + e2Old)),
    'E2: book KV chuyển key bake');
  ok(S().chapterBook === e2New, `E2: chapterBook = slug mới (thấy ${S().chapterBook})`);

  console.log('\n========== KẾT QUẢ ==========');
  const allErr = bad.concat(errors);
  console.log(JSON.stringify({
    bai: 't_admin_flow.mjs · hồi kiểm lỗi admin',
    dat: pass, loi: bad.length, errors: allErr,
  }, null, 1));
  if (allErr.length) console.log('CÒN LỖI:\n - ' + allErr.join('\n - '));
  w.close();
  process.exit(allErr.length ? 1 : 0);
})().catch(e => {
  console.log(JSON.stringify({ bai: 't_admin_flow.mjs', dat: pass, loi: bad.length, errors: ['harness: ' + (e && e.stack || e)] }, null, 1));
  process.exit(2);
});
