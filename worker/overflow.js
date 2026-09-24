/* Overflow: đẩy book/img ra khỏi KV sang hai nền tảng free.
   0) Bìa truyện (kind=cover) → Supabase Storage bucket `covers` (1 GB free)
   1) Supabase Postgres (bảng ssochuz_blobs) — secret SUPABASE_SERVICE_ROLE trên Worker
   2) Cloudflare R2 (binding CZ_R2) — 10 GB free
   Không cấu hình thì mọi thứ vẫn nằm full trong KV như cũ. Secret không bao giờ
   được gửi ra trình duyệt. */

function sbUrl(env) { return String((env && env.SUPABASE_URL) || '').replace(/\/+$/, ''); }
function sbKey(env) { return String((env && env.SUPABASE_SERVICE_ROLE) || '').trim(); }
function hasR2(env) { return !!(env && env.CZ_R2 && typeof env.CZ_R2.put === 'function'); }

export function overflowStatus(env) {
  const supabase = !!(sbUrl(env) && sbKey(env));
  return {
    supabase,
    covers: supabase, /* bìa → Supabase Storage bucket `covers` (1 GB free, không unlimited) */
    images: supabase, /* ảnh chương → bucket `images` (để dành 500 MB Postgres cho book/nội dung) */
    r2: hasR2(env),
  };
}

export function hasOverflow(env) {
  const s = overflowStatus(env);
  return s.supabase || s.r2;
}

/* ============================================================================
   GHIM PROJECT SUPABASE — ĐƯỜNG CỨU HỘ KHI MẤT BIẾN `SUPABASE_URL` (1.16.1)
   ----------------------------------------------------------------------------
   Sự cố thật ngày 23/09: `npx wrangler deploy` thay TOÀN BỘ biến thường của
   Worker bằng đúng nội dung worker/wrangler.toml. `SUPABASE_URL` khi đó chỉ đặt
   tay trên dashboard ⇒ bị xoá ⇒ overflow mất chỗ đọc (bảng ssochuz_blobs nằm ở
   <SUPABASE_URL>/rest/v1/…) ⇒ CẢ 63 bộ chỉ còn stub trong KV, mọi đường đọc bộ
   chết (502/404) dù Worker vẫn báo version mới. Secret (ADMIN_KEY,
   SUPABASE_SERVICE_ROLE…) thì wrangler GIỮ nên nhìn bên ngoài rất khó đoán bệnh.

   Từ 1.16.1: `SUPABASE_URL` được ghi thẳng vào worker/wrangler.toml (hết bị xoá),
   và NẾU vẫn thiếu biến thì Worker tự lấy Project URL mà quản trị đã lưu ở
   /admin → Cài đặt & đồng bộ → Đăng nhập (KV `registry.settings.auth.supabaseUrl`)
   — đúng ghim mà phần đăng nhập vẫn dùng. Nhờ vậy đọc truyện sống lại mà KHÔNG
   cần deploy lại. Ghim cache 60 giây trong isolate để không tốn lượt đọc KV.
   ========================================================================== */
export const SUPABASE_HOST_RE = /^https:\/\/[a-z0-9][a-z0-9-]*\.supabase\.(co|in|net)$/i;
const _pinCache = new WeakMap();   /* CZ_KV -> {t, url} — mỗi KV một ghim */

/* quản trị vừa Lưu registry (đổi ghim?) → bỏ cache để hiệu lực ngay */
export function sbPinReset(env) { try { if (env && env.CZ_KV) _pinCache.delete(env.CZ_KV); } catch (e) {} }

/* Project URL quản trị lưu trong KV (KHÔNG xét biến môi trường). */
export async function sbPinUrl(env) {
  const kv = env && env.CZ_KV;
  if (!kv) return '';
  const cached = _pinCache.get(kv);
  if (cached && cached.t > Date.now()) return cached.url;
  const slot = { t: Date.now() + 60000, url: '' };
  _pinCache.set(kv, slot);
  try {
    const reg = await kv.get('registry', { type: 'json' });
    const u = String((reg && reg.settings && reg.settings.auth && reg.settings.auth.supabaseUrl) || '').trim().replace(/\/+$/, '');
    /* chỉ nhận đúng host *.supabase.co|in|net — URL lạ trong registry không được
       biến thành nơi Worker gửi service-role key tới */
    if (u && SUPABASE_HOST_RE.test(u)) slot.url = u;
  } catch (e) { /* KV lỗi → coi như chưa ghim; tầng trên sẽ báo thiếu biến */ }
  return slot.url;
}

/* env có SUPABASE_URL "thật" (biến môi trường) → trả nguyên; thiếu thì trả bản
   sao có SUPABASE_URL lấy từ ghim KV. KHÔNG đổi env gốc (Worker dùng chung). */
export async function resolveEnv(env) {
  if (!env || sbUrl(env)) return env;
  const pin = await sbPinUrl(env);
  if (!pin) return env;
  const e = Object.assign({}, env);
  e.SUPABASE_URL = pin;
  e.SUPABASE_URL_VIA = 'kv';
  return e;
}

/* Biến còn thiếu để overflow đọc/ghi được — dùng cho thông báo lỗi nói rõ
   "thiếu biến nào" thay vì "không đọc được dữ liệu bộ (overflow?)". */
export function missingOverflowVars(env) {
  const out = [];
  if (!sbUrl(env)) out.push('SUPABASE_URL');
  if (!sbKey(env)) out.push('SUPABASE_SERVICE_ROLE');
  return out;
}

/* Trạng thái overflow CÓ kể ghim KV + nói rõ URL lấy từ đâu và còn thiếu gì.
   /api/health dùng bản này để người vận hành nhìn một cái là biết bệnh. */
export async function overflowStatusResolved(env) {
  const fromEnv = sbUrl(env);
  const e = fromEnv ? env : await resolveEnv(env);
  const st = overflowStatus(e);
  st.supabaseUrl = sbUrl(e);
  st.urlVia = sbUrl(e) ? (fromEnv ? 'env' : 'kv') : '';
  st.missing = missingOverflowVars(e);
  return st;
}

function isStub(obj) {
  return !!(obj && obj.overflow && !Array.isArray(obj.chapters));
}

async function putR2(env, key, text, mime) {
  await env.CZ_R2.put(key, text, { httpMetadata: { contentType: mime || 'text/plain' } });
}

async function getR2(env, key) {
  const obj = await env.CZ_R2.get(key);
  if (!obj) return null;
  return { value: await obj.text(), mime: (obj.httpMetadata && obj.httpMetadata.contentType) || '', via: 'r2' };
}

async function putSupabase(env, key, text, mime) {
  const res = await fetch(sbUrl(env) + '/rest/v1/ssochuz_blobs?on_conflict=key', {
    method: 'POST',
    headers: {
      apikey: sbKey(env),
      Authorization: 'Bearer ' + sbKey(env),
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ key, value: text, mime: mime || 'text/plain', updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + String(await res.text()).slice(0, 180));
}

/* Đọc 1 khoá ở Supabase, KÈM lý do khi không lấy được (1.16.1: thông báo lỗi
   phải nói được "thiếu biến" hay "Supabase từ chối HTTP 401"). */
async function getSupabaseChecked(env, key) {
  let res;
  try {
    res = await fetch(sbUrl(env) + '/rest/v1/ssochuz_blobs?key=eq.' + encodeURIComponent(key) + '&select=value,mime', {
      headers: { apikey: sbKey(env), Authorization: 'Bearer ' + sbKey(env) },
    });
  } catch (e) {
    return { hit: null, why: 'supabase: không gọi được ' + sbUrl(env) + ' (' + ((e && e.message) || e) + ')' };
  }
  if (!res.ok) {
    const t = String(await res.text()).slice(0, 140);
    return { hit: null, why: 'supabase: HTTP ' + res.status + (res.status === 401 || res.status === 403 ? ' (SUPABASE_SERVICE_ROLE sai/hết hạn?)' : '') + (t ? ' ' + t : '') };
  }
  let rows;
  try { rows = await res.json(); } catch (e) { return { hit: null, why: 'supabase: trả về không phải JSON' }; }
  if (!rows || !rows[0] || rows[0].value == null) return { hit: null, why: 'supabase: không có khoá ' + key + ' trong bảng ssochuz_blobs' };
  return { hit: { value: rows[0].value, mime: rows[0].mime || '', via: 'supabase' }, why: '' };
}

export async function putOverflow(env, key, value, mime) {
  env = await resolveEnv(env);
  const st = overflowStatus(env);
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const out = { ok: false, via: '', errors: [] };
  if (st.r2) {
    try { await putR2(env, key, text, mime); out.ok = true; out.via = out.via ? out.via + '+r2' : 'r2'; }
    catch (e) { out.errors.push('r2: ' + (e.message || e)); }
  }
  if (st.supabase) {
    try { await putSupabase(env, key, text, mime); out.ok = true; out.via = out.via ? out.via + '+supabase' : 'supabase'; }
    catch (e) { out.errors.push('supabase: ' + (e.message || e)); }
  }
  return out;
}

/* Đọc overflow KÈM chẩn đoán: { hit, tried, status } — tried là lý do từng
   đường thất bại, để 502 nói đúng bệnh thay vì "(overflow?)". */
export async function getOverflowChecked(env, key) {
  env = await resolveEnv(env);
  const st = overflowStatus(env);
  const tried = [];
  let hit = null;
  if (st.r2) {
    try {
      const h = await getR2(env, key);
      if (h) hit = h; else tried.push('r2: không có khoá ' + key);
    } catch (e) { tried.push('r2: ' + ((e && e.message) || e)); }
  }
  if (!hit && st.supabase) {
    try {
      const r = await getSupabaseChecked(env, key);
      if (r.hit) hit = r.hit; else tried.push(r.why);
    } catch (e) { tried.push('supabase: ' + ((e && e.message) || e)); }
  }
  if (!hit && !st.r2 && !st.supabase) {
    const miss = missingOverflowVars(env);
    tried.push('chưa cấu hình overflow nào — thiếu ' + (miss.join(' + ') || 'biến') + (hasR2(env) ? '' : ' (hoặc chưa binding CZ_R2)'));
  }
  return { hit, tried, status: st };
}

export async function getOverflow(env, key) {
  const r = await getOverflowChecked(env, key);
  return r.hit;
}

export async function dropOverflow(env, key) {
  env = await resolveEnv(env);
  const st = overflowStatus(env);
  if (st.r2) { try { await env.CZ_R2.delete(key); } catch (e) {} }
  if (st.supabase) {
    try {
      await fetch(sbUrl(env) + '/rest/v1/ssochuz_blobs?key=eq.' + encodeURIComponent(key), {
        method: 'DELETE',
        headers: { apikey: sbKey(env), Authorization: 'Bearer ' + sbKey(env) },
      });
    } catch (e) {}
  }
}

export async function materializeBook(env, raw, slug) {
  const r = await materializeBookChecked(env, raw, slug);
  return r.book;
}

/* Như materializeBook nhưng PHÂN BIỆT ba trạng thái (1.16.1):
     'ok'         có book đầy đủ
     'not-stub'   KV đang giữ trọn bộ (không cần overflow)
     'unreadable' KV chỉ còn stub mà không lấy được bản đầy đủ
   Kèm `missing` (tên biến thiếu) và `why` (lý do từng đường đọc thất bại) để
   trang đọc/admin báo đúng bệnh. */
export async function materializeBookChecked(env, raw, slug) {
  if (raw == null) return { status: 'missing', book: null, stub: null, missing: missingOverflowVars(env), why: ['KV không có khoá book:' + (slug || '')] };
  let book;
  try { book = typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch (e) { return { status: 'unreadable', book: null, stub: null, missing: [], why: ['giá trị khoá book:' + (slug || '') + ' không phải JSON hợp lệ'] }; }
  if (!isStub(book)) return { status: 'not-stub', book: book, stub: null, missing: [], why: [] };
  const key = 'book:' + (book.slug || slug || '');
  const got = await getOverflowChecked(env, key);
  if (!got.hit) {
    return { status: 'unreadable', book: null, stub: book, missing: missingOverflowVars(env), why: got.tried };
  }
  try { return { status: 'ok', book: JSON.parse(got.hit.value), stub: book, missing: [], why: [] }; }
  catch (e) { return { status: 'unreadable', book: null, stub: book, missing: [], why: ['bản overflow của ' + key + ' không phải JSON hợp lệ'] }; }
}

export async function readBook(env, slug) {
  const r = await readBookChecked(env, slug);
  return r.book;
}

/* readBook có chẩn đoán — /api/book, /toc, /chapter dùng bản này để phân biệt
   "chưa có bộ" (404) với "có mà không đọc được" (502). */
export async function readBookChecked(env, slug) {
  if (!env || !env.CZ_KV || !slug) return { status: 'missing', book: null, stub: null, missing: missingOverflowVars(env), why: ['chưa bind CZ_KV hoặc thiếu slug'] };
  const raw = await env.CZ_KV.get('book:' + slug, { type: 'text' });
  if (raw == null) return { status: 'missing', book: null, stub: null, missing: missingOverflowVars(env), why: ['KV không có khoá book:' + slug] };
  const r = await materializeBookChecked(env, raw, slug);
  return r;
}

/* Ghi book: overflow thành công → KV chỉ giữ stub nhỏ. Overflow lỗi → full JSON ở KV. */
export async function persistBook(env, slug, parsed) {
  env = await resolveEnv(env);
  const full = JSON.stringify(parsed);
  const bytes = new TextEncoder().encode(full).length;
  const saved = new Date().toISOString();
  const chapters = Array.isArray(parsed.chapters) ? parsed.chapters.length : 0;
  const ov = hasOverflow(env) ? await putOverflow(env, 'book:' + slug, full, 'application/json') : { ok: false, via: '' };
  if (ov.ok) {
    const stub = {
      overflow: ov.via, slug, title: parsed.title || slug, chapters,
    };
    if (parsed.lock) stub.lock = parsed.lock;
    await env.CZ_KV.put('book:' + slug, JSON.stringify(stub), {
      metadata: { saved, chapters, bytes, overflow: ov.via },
    });
    return { bytes, saved, overflow: ov.via, stub: true };
  }
  await env.CZ_KV.put('book:' + slug, full, { metadata: { saved, chapters, bytes } });
  return { bytes, saved, overflow: '', stub: false, errors: ov.errors || [] };
}

function coverExt(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'image/jpeg') return 'jpg';
  if (t === 'image/png') return 'png';
  return 'webp';
}

function bytesFromB64(s) {
  let t = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  const bin = atob(t);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function ensureBucket(env, name) {
  const res = await fetch(sbUrl(env) + '/storage/v1/bucket', {
    method: 'POST',
    headers: {
      apikey: sbKey(env),
      Authorization: 'Bearer ' + sbKey(env),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: name, name: name, public: true,
      /* trần cứng mỗi tệp — trình duyệt đã nén xuống ~100–250 KB, đặt 8 MB để
         ảnh lớn dán từ nơi khác vẫn không phá bucket */
      file_size_limit: 8 * 1024 * 1024,
    }),
  });
  if (res.ok || res.status === 409) return true;
  const t = String(await res.text());
  if (/exist|duplicate|already/i.test(t)) return true;
  throw new Error('Không tạo được bucket ' + name + ': HTTP ' + res.status + ' ' + t.slice(0, 140));
}

function putBucketObject(env, bucket, pathName, bin, type) {
  return fetch(sbUrl(env) + '/storage/v1/object/' + bucket + '/' + pathName, {
    method: 'POST',
    headers: {
      apikey: sbKey(env),
      Authorization: 'Bearer ' + sbKey(env),
      'Content-Type': type || 'image/webp',
      'x-upsert': 'true',
    },
    body: bin,
  });
}

async function putStorageImage(env, bucket, id, data, type) {
  const bytes = Math.floor(String(data).replace(/=+$/, '').length * 3 / 4);
  const pathName = id + '.' + coverExt(type);
  const bin = bytesFromB64(data);
  let res = await putBucketObject(env, bucket, pathName, bin, type);
  if (res.status === 404 || res.status === 400) {
    await ensureBucket(env, bucket);
    res = await putBucketObject(env, bucket, pathName, bin, type);
  }
  if (!res.ok) {
    const msg = String(await res.text()).slice(0, 180);
    /* kèm mã HTTP để tầng trên biết 400/404 (chưa có bucket) mà thử lại */
    throw Object.assign(new Error('Supabase Storage từ chối (HTTP ' + res.status + '): ' + msg), { status: res.status });
  }
  const url = sbUrl(env) + '/storage/v1/object/public/' + bucket + '/' + pathName;
  const at = new Date().toISOString();
  await env.CZ_KV.put('img:' + id, JSON.stringify({ overflow: 'supabase-storage', url, type, bytes }), {
    metadata: { type, bytes, at, overflow: 'supabase-storage', url, bucket },
  });
  return { bytes, overflow: 'supabase-storage', url, bucket };
}

/* Bìa truyện: ưu tiên Supabase Storage (CDN, không ăn KV). Chưa gắn
   SUPABASE_SERVICE_ROLE thì rơi về persistImage (KV) như cũ. Gắn rồi mà
   Storage từ chối → ném lỗi, không báo đã lưu. */
export async function persistCover(env, id, data, type) {
  env = await resolveEnv(env);
  if (!sbUrl(env) || !sbKey(env)) return persistImage(env, id, data, type);
  return putStorageImage(env, 'covers', id, data, type);
}

/* Ảnh TRONG CHƯƠNG (truyện tranh, ảnh minh hoạ): cũng đẩy lên Storage bucket
   `images`. Vì sao: bảng ssochuz_blobs nằm trong Postgres — gói free chỉ 500 MB
   *database* (Storage 1 GB tính riêng), mà ảnh chương lại là thứ nặng nhất
   (1 chương truyện tranh có thể vài chục ảnh). Storage từ chối thì RƠI VỀ
   đường cũ (blobs/KV) chứ không làm hỏng thao tác upload của người dùng. */
export async function persistChapterImage(env, id, data, type) {
  env = await resolveEnv(env);
  if (!sbUrl(env) || !sbKey(env)) return persistImage(env, id, data, type);
  try {
    return await putStorageImage(env, 'images', id, data, type);
  } catch (e) {
    const fallback = await persistImage(env, id, data, type);
    fallback.fallbackFrom = String((e && e.message) || e).slice(0, 160);
    return fallback;
  }
}

export async function persistImage(env, id, data, type, extraMeta) {
  env = await resolveEnv(env);
  const bytes = Math.floor(String(data).replace(/=+$/, '').length * 3 / 4);
  const at = new Date().toISOString();
  const meta = Object.assign({ type, bytes, at }, extraMeta || {});
  const ov = hasOverflow(env) ? await putOverflow(env, 'img:' + id, data, type) : { ok: false, via: '' };
  if (ov.ok) {
    meta.overflow = ov.via;
    await env.CZ_KV.put('img:' + id, JSON.stringify({ overflow: ov.via, type, bytes }), { metadata: meta });
    return { bytes, overflow: ov.via };
  }
  await env.CZ_KV.put('img:' + id, data, { metadata: meta });
  return { bytes, overflow: '' };
}

/* ============================================================================
   CHUYỂN DATA CŨ SANG OVERFLOW (Supabase/R2)
   ----------------------------------------------------------------------------
   Trước đây chỉ dữ liệu MỚI (ghi sau khi gắn SUPABASE_SERVICE_ROLE/CZ_R2) mới
   được đẩy khỏi KV; bìa/book đã lưu base64 trong KV từ trước nằm yên → tạo
   bảng ssochuz_blobs rồi vẫn "chưa chuyển được". Hàm này quét KV theo lô nhỏ
   (mỗi lần gọi Worker chỉ chịu được ít chục subrequest) và ghi lại qua đúng
   persistBook / persistCover / persistImage để KV chỉ còn stub:
     · book: JSON đầy đủ → bảng ssochuz_blobs/R2 (KV còn stub nhỏ)
     · img: bìa (được registry.thumb/slide trỏ tới) → Supabase Storage `covers`
     · img: còn lại (ảnh trong chương) → ssochuz_blobs/R2
   Lỗi từng mục không làm hỏng lô (giữ nguyên base64 trong KV, liệt kê lỗi).
   ========================================================================== */
export function coverIdSet(reg) {
  const ids = {};
  ((reg && reg.lib) || []).forEach((n) => {
    if (!n) return;
    [n.thumb, n.slide, n.cover].forEach((u) => {
      const m = /\/api\/img\/([A-Za-z0-9_-]+)\b/.exec(String(u || ''));
      if (m) ids[m[1]] = 1;
    });
  });
  return ids;
}

export async function migrateOverflow(env, opts) {
  opts = opts || {};
  env = await resolveEnv(env);
  const st = overflowStatus(env);
  const limit = Math.max(1, Math.min(25, parseInt(opts.limit, 10) || 8));
  const only = String(opts.only || '').toLowerCase();
  const out = {
    ok: true, status: st, limit,
    moved: { books: 0, covers: 0, images: 0 }, already: 0, scanned: 0,
    failed: [], done: false, writes: 0,
  };
  if (!st.supabase && !st.r2) {
    out.ok = false;
    const miss = missingOverflowVars(env);
    out.error = 'Chưa cấu hình overflow: còn thiếu ' + (miss.join(' + ') || 'biến')
      + ' (SUPABASE_URL nằm trong worker/wrangler.toml — sửa rồi `npx wrangler deploy`;'
      + ' SUPABASE_SERVICE_ROLE là secret: `npx wrangler secret put SUPABASE_SERVICE_ROLE`),'
      + ' hoặc binding CZ_R2, rồi deploy Worker trước khi chuyển.';
    out.missing = miss;
    return out;
  }
  let coverIds = {};
  try { coverIds = coverIdSet(await env.CZ_KV.get('registry', { type: 'json' })); } catch (e) {}
  const work = () => out.moved.books + out.moved.covers + out.moved.images + out.failed.length;
  const budget = () => work() >= limit;

  /* 1) BOOK: full JSON → stub (persistBook tự chọn overflow hay rơi về KV) */
  if (only !== 'covers' && only !== 'images') {
    let cursor;
    do {
      const l = await env.CZ_KV.list({ prefix: 'book:', limit: 1000, cursor });
      for (const k of (l.keys || [])) {
        if (budget()) break;
        out.scanned++;
        const raw = await env.CZ_KV.get(k.name, { type: 'text' });
        if (raw == null) continue;
        let parsed;
        try { parsed = JSON.parse(raw); } catch (e) { continue; }
        if (isStub(parsed)) { out.already++; continue; }
        const slug = (() => { try { return decodeURIComponent(k.name.slice('book:'.length)); } catch (e) { return k.name.slice('book:'.length); } })();
        try {
          const r = await persistBook(env, slug, parsed);
          out.writes++;
          if (r && r.stub) out.moved.books++;
          else if (r && (r.errors || []).length) out.failed.push({ key: k.name, error: String((r.errors || [])[0]).slice(0, 160) });
          else out.already++;
        } catch (e) { out.failed.push({ key: k.name, error: String((e && e.message) || e).slice(0, 160) }); }
      }
      cursor = budget() ? null : (l.list_complete ? null : l.cursor);
    } while (cursor && !budget());
  }

  /* 2) IMG: bìa → Storage `covers`; ảnh chương → ssochuz_blobs/R2 */
  if (only !== 'books') {
    let cursor;
    do {
      const l = await env.CZ_KV.list({ prefix: 'img:', limit: 1000, cursor });
      for (const k of (l.keys || [])) {
        if (budget()) break;
        out.scanned++;
        const value = await env.CZ_KV.get(k.name, { type: 'text' });
        if (value == null) continue;
        if (value.charAt(0) === '{') { out.already++; continue; }   /* stub rồi */
        const id = (() => { try { return decodeURIComponent(k.name.slice('img:'.length)); } catch (e) { return k.name.slice('img:'.length); } })();
        const type = (k.metadata && k.metadata.type) || 'image/webp';
        try {
          if (coverIds[id] && st.supabase) { await persistCover(env, id, value, type); out.moved.covers++; }
          else if (st.supabase) {
            /* ảnh chương → Storage bucket `images` (rơi về blobs nếu Storage chối) */
            const r = await persistChapterImage(env, id, value, type);
            if (r && r.fallbackFrom) out.failed.push({ key: k.name, error: 'Storage chối, giữ ở blobs: ' + r.fallbackFrom });
            out.moved.images++;
          } else { await persistImage(env, id, value, type); out.moved.images++; }
          out.writes++;
        } catch (e) { out.failed.push({ key: k.name, error: String((e && e.message) || e).slice(0, 160) }); }
      }
      cursor = budget() ? null : (l.list_complete ? null : l.cursor);
    } while (cursor && !budget());
  }
  out.done = !budget();
  return out;
}

export async function readImage(env, id) {
  if (!env || !env.CZ_KV) return null;
  env = await resolveEnv(env);
  const { value, metadata } = await env.CZ_KV.getWithMetadata('img:' + id, { type: 'text' });
  if (value == null) return null;
  if (value.charAt(0) === '{') {
    try {
      const stub = JSON.parse(value);
      if (stub && stub.overflow === 'supabase-storage' && stub.url) {
        return { data: null, url: stub.url, type: stub.type || (metadata && metadata.type) || 'image/webp', metadata };
      }
      if (stub && stub.overflow) {
        const got = await getOverflow(env, 'img:' + id);
        if (!got) return null;
        return { data: got.value, type: stub.type || metadata && metadata.type || got.mime || 'image/webp', metadata };
      }
    } catch (e) { /* không phải stub — rơi xuống base64 thường */ }
  }
  return { data: value, type: (metadata && metadata.type) || 'image/webp', metadata };
}
