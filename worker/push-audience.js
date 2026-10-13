/* Scoped Web Push v2. Legacy subscriptions deliberately have no audience.
   Account follows are read at drain time (not a stale device snapshot).
   null = backend unavailable: defer, never broadcast or discard the job. */
export function pushTopics(value) {
  if (!Array.isArray(value) || value.length > 500) return null;
  if (value.some(x => typeof x !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,119}$/i.test(x))) return null;
  return [...new Set(value)].sort();
}

export function pushAudience(env, request = fetch) {
  const checks = new Map();
  return async (sub, slug) => {
    if (sub.scopeVersion !== 2) return false;
    if (!sub.ownerId) return !!pushTopics(sub.topics)?.includes(slug);
    const key = sub.ownerId + ':' + slug;
    if (!checks.has(key)) checks.set(key, (async () => {
      const base = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
      const secret = env.SUPABASE_SERVICE_ROLE;
      if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in|net)$/i.test(base) || !secret) return null;
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 8000);
      try {
        const url = base + '/rest/v1/story_follows?select=story_id&user_id=eq.' +
          encodeURIComponent(sub.ownerId) + '&story_id=eq.' + encodeURIComponent(slug) + '&limit=1';
        const response = await request(url, { headers: { apikey: secret, Authorization: 'Bearer ' + secret }, signal: ctl.signal });
        if (!response.ok) return null;
        const rows = await response.json();
        return Array.isArray(rows) ? rows.some(row => row.story_id === slug) : null;
      } catch (_) { return null; }
      finally { clearTimeout(timer); }
    })());
    return checks.get(key);
  };
}
