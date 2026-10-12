/* Standalone Ssochuz community Worker.
 * D1 actions live here; the existing chuseoz-cms Worker is only reached through
 * a Cloudflare service binding for Supabase-token verification and public story
 * metadata. Its wrangler.toml is not part of this deployment.
 */
import { handleCommunity } from './community.js';
import { VERSION } from '../src/shared/version.js';

const REGISTRY_CACHE_MS = 30_000;
let registryCache = { at: 0, lib: null };

function corsHeaders(req, env) {
  const origin = String(req.headers.get('origin') || '');
  const allowed = String((env && env.ALLOW_ORIGIN) || '').split(',').map((value) => value.trim()).filter(Boolean);
  const headers = {
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization',
    'access-control-max-age': '86400',
    'vary': 'Origin',
  };
  if (origin && allowed.includes(origin)) headers['access-control-allow-origin'] = origin;
  return headers;
}
function json(value, { status = 200, cors = {}, headers = {} } = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...cors, ...headers },
  });
}
function tokenClaims(req) {
  const match = String(req.headers.get('authorization') || '').match(/^Bearer\s+([^\s]+)$/i);
  if (!match) return null;
  const pieces = match[1].split('.');
  if (pieces.length !== 3) return null;
  try {
    let part = pieces[1].replace(/-/g, '+').replace(/_/g, '/');
    while (part.length % 4) part += '=';
    const payload = JSON.parse(atob(part));
    return payload && typeof payload === 'object' ? payload : null;
  } catch (_) { return null; }
}
async function userFromReq(req, env) {
  const token = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const claims = tokenClaims(req);
  const sub = String(claims && claims.sub || '').trim();
  if (!token || !sub) return { user: null, err: 'Thiếu Supabase Bearer JWT hợp lệ.' };
  if (!env.CMS || typeof env.CMS.fetch !== 'function') {
    return { user: null, err: 'Thiếu service binding CMS tới chuseoz-cms.' };
  }

  /* The existing CMS Worker verifies HS256/JWKS and returns the authenticated
     UID through its no-write /api/auth/me route. This Worker trusts only that
     service-binding response, and checks it matches JWT sub before using it. */
  let response;
  try {
    response = await env.CMS.fetch(new Request('https://chuseoz-cms/api/auth/me', {
      headers: { authorization: 'Bearer ' + token },
    }));
  } catch (error) {
    return { user: null, err: 'Không gọi được CMS để xác minh Supabase JWT.' };
  }
  const data = await response.json().catch(() => ({}));
  const verifiedUid = String(data && data.user && data.user.uid || '');
  if (!response.ok || !data || data.ok !== true || !verifiedUid || verifiedUid !== sub) {
    return { user: null, err: String((data && data.error) || 'CMS từ chối Supabase JWT.'), source: '' };
  }
  return {
    source: 'supabase',
    user: {
      uid: verifiedUid,
      role: String(claims.role || ''),
      aud: claims.aud,
      exp: Number(claims.exp) || 0,
      iss: String(claims.iss || ''),
    },
  };
}
async function publicRegistry(env) {
  const now = Date.now();
  if (registryCache.lib && now - registryCache.at < REGISTRY_CACHE_MS) return registryCache.lib;
  if (!env.CMS || typeof env.CMS.fetch !== 'function') throw new Error('Thiếu service binding CMS tới chuseoz-cms.');
  const response = await env.CMS.fetch(new Request('https://chuseoz-cms/api/registry', {
    headers: { accept: 'application/json' },
  }));
  if (!response.ok) throw new Error('CMS không trả được public registry (' + response.status + ').');
  const data = await response.json();
  const lib = Array.isArray(data && data.lib) ? data.lib : [];
  registryCache = { at: now, lib };
  return lib;
}
async function lookupStory(env, slug) {
  const lib = await publicRegistry(env);
  const entry = lib.find((row) => row && row.slug === slug);
  if (!entry) return null; // /api/registry của CMS chỉ chứa truyện công khai.
  const response = await env.CMS.fetch(new Request(
    'https://chuseoz-cms/api/book/' + encodeURIComponent(slug) + '/toc',
    { headers: { accept: 'application/json' } },
  ));
  if (response.status === 403) {
    return { public: true, entry, book: { lock: true }, visibleChapters: [] };
  }
  if (!response.ok) return null;
  const toc = await response.json().catch(() => null);
  if (!toc || toc.ok !== true || toc.slug !== slug || !Array.isArray(toc.chapters)) return null;
  return {
    public: true,
    entry,
    book: { lock: !!entry.lock },
    visibleChapters: toc.chapters,
  };
}

const handler = {
  async fetch(req, env) {
    const cors = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url);
    if (url.pathname === '/api/health' && req.method === 'GET') {
      return json({
        ok: true,
        worker: 'ssochuz-community',
        version: VERSION,
        d1: !!(env.CZ_DB && typeof env.CZ_DB.prepare === 'function'),
        cmsBinding: !!(env.CMS && typeof env.CMS.fetch === 'function'),
      }, { cors, headers: { 'cache-control': 'no-store' } });
    }
    try {
      const result = await handleCommunity(req, env, cors, {
        json,
        userFromReq,
        lookupStory: (slug) => lookupStory(env, slug),
      });
      if (result) return result;
      return json({ ok: false, error: 'Không tìm thấy endpoint community.' }, { status: 404, cors });
    } catch (error) {
      return json({ ok: false, error: 'Community Worker gặp lỗi nội bộ.' }, { status: 500, cors });
    }
  },
};
export default handler;
