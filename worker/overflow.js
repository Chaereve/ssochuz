/* Overflow: đẩy book/img ra khỏi KV sang hai nền tảng free.
   1) Supabase Postgres (bảng ssochuz_blobs) — secret SUPABASE_SERVICE_ROLE trên Worker
   2) Cloudflare R2 (binding CZ_R2) — 10 GB free
   Không cấu hình thì mọi thứ vẫn nằm full trong KV như cũ. Secret không bao giờ
   được gửi ra trình duyệt. */

function sbUrl(env) { return String((env && env.SUPABASE_URL) || '').replace(/\/+$/, ''); }
function sbKey(env) { return String((env && env.SUPABASE_SERVICE_ROLE) || '').trim(); }

export function overflowStatus(env) {
  return {
    supabase: !!(sbUrl(env) && sbKey(env)),
    r2: !!(env && env.CZ_R2 && typeof env.CZ_R2.put === 'function'),
  };
}

export function hasOverflow(env) {
  const s = overflowStatus(env);
  return s.supabase || s.r2;
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

async function getSupabase(env, key) {
  const res = await fetch(sbUrl(env) + '/rest/v1/ssochuz_blobs?key=eq.' + encodeURIComponent(key) + '&select=value,mime', {
    headers: { apikey: sbKey(env), Authorization: 'Bearer ' + sbKey(env) },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  if (!rows || !rows[0] || rows[0].value == null) return null;
  return { value: rows[0].value, mime: rows[0].mime || '', via: 'supabase' };
}

export async function putOverflow(env, key, value, mime) {
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

export async function getOverflow(env, key) {
  const st = overflowStatus(env);
  if (st.r2) {
    try { const hit = await getR2(env, key); if (hit) return hit; } catch (e) {}
  }
  if (st.supabase) {
    try { const hit = await getSupabase(env, key); if (hit) return hit; } catch (e) {}
  }
  return null;
}

export async function dropOverflow(env, key) {
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
  if (raw == null) return null;
  let book;
  try { book = typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch (e) { return null; }
  if (!isStub(book)) return book;
  const got = await getOverflow(env, 'book:' + (book.slug || slug || ''));
  if (!got) return null;
  try { return JSON.parse(got.value); } catch (e) { return null; }
}

export async function readBook(env, slug) {
  if (!env || !env.CZ_KV || !slug) return null;
  const raw = await env.CZ_KV.get('book:' + slug, { type: 'text' });
  if (raw == null) return null;
  return materializeBook(env, raw, slug);
}

/* Ghi book: overflow thành công → KV chỉ giữ stub nhỏ. Overflow lỗi → full JSON ở KV. */
export async function persistBook(env, slug, parsed) {
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

export async function persistImage(env, id, data, type, extraMeta) {
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

export async function readImage(env, id) {
  if (!env || !env.CZ_KV) return null;
  const { value, metadata } = await env.CZ_KV.getWithMetadata('img:' + id, { type: 'text' });
  if (value == null) return null;
  if (value.charAt(0) === '{') {
    try {
      const stub = JSON.parse(value);
      if (stub && stub.overflow) {
        const got = await getOverflow(env, 'img:' + id);
        if (!got) return null;
        return { data: got.value, type: stub.type || metadata && metadata.type || got.mime || 'image/webp', metadata };
      }
    } catch (e) { /* không phải stub — rơi xuống base64 thường */ }
  }
  return { data: value, type: (metadata && metadata.type) || 'image/webp', metadata };
}
