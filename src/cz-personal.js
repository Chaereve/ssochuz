/* ============================================================================
   ssochuz · dữ liệu cá nhân: theo dõi + tiến độ đọc (v1)
   ----------------------------------------------------------------------------
   Nguồn thật khi đăng nhập: Supabase Auth/Postgres + RLS.
   Khách: localStorage versioned. Khi đăng nhập, merge guest/cache → server chỉ
   nếu timestamp/tiến độ cục bộ mới hơn; khi logout không trộn dữ liệu user vào
   kho guest dùng chung. Không dùng service_role, Worker, D1 hay KV cho dữ liệu
   cá nhân. Worker chỉ được gọi cho mục lục công khai và community actions.
   ========================================================================== */
(function (w) {
  'use strict';

  var CZ = w.CZ || {};
  var AUTH = w.CZ_AUTH || {};
  var KEY_PROGRESS = 'ssochuz:progress:v1';
  var KEY_FOLLOWS = 'ssochuz:follows:v1';
  var CACHE_PROGRESS_PREFIX = 'ssochuz:progress-cache:';
  var CACHE_FOLLOWS_PREFIX = 'ssochuz:follows-cache:';
  var LEGACY_PROGRESS = 'ssochuz-prog-';
  var LEGACY_WHEN = 'ssochuz-when-';
  var LEGACY_FOLLOWS = 'ssochuz-follow';
  var MAX_CHAPTER = 100000;
  var UPSERT_DELAY = 650;
  var CACHE_TTL = 5 * 60 * 1000;
  var SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,119}$/i;

  var active = { mode: 'guest', uid: '', progress: Object.create(null), follows: Object.create(null) };
  var authUid = '';
  var generation = 0;
  var currentTask = Promise.resolve();
  var progressTimers = Object.create(null);
  var progressPending = Object.create(null);
  var followPending = Object.create(null);
  var tocCache = Object.create(null);

  function safeGet(key) {
    try { return w.localStorage.getItem(key); } catch (e) { return null; }
  }
  function safeSet(key, value) {
    try { w.localStorage.setItem(key, value); return true; } catch (e) { return false; }
  }
  function safeRemove(key) { try { w.localStorage.removeItem(key); } catch (e) {} }
  function safeJSON(key, fallback) {
    try {
      var raw = w.localStorage.getItem(key);
      if (!raw) return fallback;
      var value = JSON.parse(raw);
      return value == null ? fallback : value;
    } catch (e) { return fallback; }
  }
  function validSlug(value) {
    var slug = String(value || '').trim();
    return SLUG_RE.test(slug) ? slug : '';
  }
  function clampNumber(value, min, max, fallback) {
    var n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }
  function stamp(value) {
    var n = typeof value === 'number' ? value : Date.parse(value || '');
    if (!Number.isFinite(n) || n <= 0) return 0;
    /* localStorage is editable; do not let a malformed far-future value replace
       a genuinely newer server row during guest/server merge. */
    return Math.min(n, Date.now() + 5 * 60 * 1000);
  }
  function iso(value) {
    var n = stamp(value);
    return n ? new Date(n).toISOString() : '';
  }
  function normalizeProgress(row, defaultSlug) {
    if (!row || typeof row !== 'object') return null;
    var slug = validSlug(row.storyId || row.story_id || row.slug || defaultSlug);
    var chapterIndex = clampNumber(row.chapterIndex != null ? row.chapterIndex : (row.chapter_index != null ? row.chapter_index : row.chapter), 1, MAX_CHAPTER, 0);
    if (!slug || !chapterIndex) return null;
    var updatedAt = iso(row.updatedAt || row.updated_at || row.at);
    if (!updatedAt) updatedAt = new Date(0).toISOString();
    var completedAt = iso(row.completedAt || row.completed_at);
    var scrollPercent = clampNumber(row.scrollPercent != null ? row.scrollPercent : row.scroll_percent, 0, 100, 0);
    var chapterId = String(row.chapterId || row.chapter_id || ('ch-' + chapterIndex)).slice(0, 160);
    return {
      storyId: slug,
      chapterId: chapterId || ('ch-' + chapterIndex),
      chapterIndex: Math.floor(chapterIndex),
      scrollPercent: scrollPercent,
      completedAt: completedAt || null,
      updatedAt: updatedAt,
    };
  }
  function normalizeFollow(row, defaultSlug) {
    if (typeof row === 'number' || typeof row === 'string') row = { lastSeenChapterIndex: row };
    if (!row || typeof row !== 'object') return null;
    var slug = validSlug(row.storyId || row.story_id || row.slug || defaultSlug);
    if (!slug) return null;
    var lastSeen = clampNumber(
      row.lastSeenChapterIndex != null ? row.lastSeenChapterIndex : (row.last_seen_chapter_index != null ? row.last_seen_chapter_index : row.baseline),
      0, MAX_CHAPTER, 0
    );
    return {
      storyId: slug,
      lastSeenChapterIndex: Math.floor(lastSeen),
      createdAt: iso(row.createdAt || row.created_at) || new Date(0).toISOString(),
      lastSeenAt: iso(row.lastSeenAt || row.last_seen_at) || new Date(0).toISOString(),
    };
  }
  function progressNewer(local, server) {
    if (!server) return !!local;
    if (!local) return false;
    var lt = stamp(local.updatedAt), st = stamp(server.updatedAt);
    if (lt !== st) return lt > st;
    if (local.chapterIndex !== server.chapterIndex) return local.chapterIndex > server.chapterIndex;
    if (local.completedAt && !server.completedAt) return true;
    if (!local.completedAt && server.completedAt) return false;
    return local.scrollPercent > server.scrollPercent;
  }
  function objectValues(input) {
    if (Array.isArray(input)) return input;
    if (input && typeof input === 'object') return Object.keys(input).map(function (key) {
      var value = input[key];
      return value && typeof value === 'object' ? Object.assign({ storyId: key }, value) : { storyId: key, lastSeenChapterIndex: value };
    });
    return [];
  }
  function oldProgress() {
    var out = Object.create(null);
    try {
      for (var i = 0; i < w.localStorage.length; i++) {
        var key = w.localStorage.key(i) || '';
        if (key.indexOf(LEGACY_PROGRESS) !== 0) continue;
        var slug = validSlug(key.slice(LEGACY_PROGRESS.length));
        var ch = parseInt(w.localStorage.getItem(key) || '0', 10) || 0;
        if (!slug || ch < 1) continue;
        var updated = parseInt(w.localStorage.getItem(LEGACY_WHEN + slug) || '0', 10) || 0;
        var row = normalizeProgress({ storyId: slug, chapterIndex: ch, updatedAt: updated || 1, scrollPercent: 0 });
        if (row && progressNewer(row, out[slug])) out[slug] = row;
      }
    } catch (e) {}
    return out;
  }
  function readProgressMap(value) {
    var out = Object.create(null);
    objectValues(value).forEach(function (item) {
      var row = normalizeProgress(item);
      if (row && progressNewer(row, out[row.storyId])) out[row.storyId] = row;
    });
    return out;
  }
  function readFollowMap(value) {
    var out = Object.create(null);
    objectValues(value).forEach(function (item) {
      var row = normalizeFollow(item);
      if (row) out[row.storyId] = row;
    });
    return out;
  }
  function mergeMap(target, source, isProgress) {
    Object.keys(source || {}).forEach(function (slug) {
      var value = source[slug];
      if (!target[slug] || (isProgress && progressNewer(value, target[slug]))) target[slug] = value;
    });
    return target;
  }
  function guestData() {
    var progress = readProgressMap(safeJSON(KEY_PROGRESS, []));
    mergeMap(progress, oldProgress(), true);
    var follows = readFollowMap(safeJSON(KEY_FOLLOWS, []));
    var legacy = safeJSON(LEGACY_FOLLOWS, {});
    if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
      Object.keys(legacy).forEach(function (slug) {
        if (!follows[slug]) {
          var row = normalizeFollow({ storyId: slug, lastSeenChapterIndex: legacy[slug] });
          if (row) follows[slug] = row;
        }
      });
    }
    return { progress: progress, follows: follows };
  }
  function cacheKey(prefix, uid) { return prefix + encodeURIComponent(String(uid || '')) + ':v1'; }
  function readUserCache(uid) {
    var keyP = cacheKey(CACHE_PROGRESS_PREFIX, uid);
    var keyF = cacheKey(CACHE_FOLLOWS_PREFIX, uid);
    var rawP = safeJSON(keyP, []);
    var rawF = safeJSON(keyF, []);
    return { progress: readProgressMap(rawP), follows: readFollowMap(rawF) };
  }
  function saveUserCache(uid, progress, follows) {
    if (!uid) return;
    safeSet(cacheKey(CACHE_PROGRESS_PREFIX, uid), JSON.stringify(Object.keys(progress || {}).map(function (slug) { return progress[slug]; })));
    safeSet(cacheKey(CACHE_FOLLOWS_PREFIX, uid), JSON.stringify(Object.keys(follows || {}).map(function (slug) { return follows[slug]; })));
  }
  function saveGuest(forceDuringAuthLoading) {
    if (active.mode !== 'guest' && !(forceDuringAuthLoading && active.mode === 'loading' && !active.uid)) return;
    /* New personal data is always namespaced and versioned. Legacy unversioned
       keys are read once for migration, never written again. */
    safeSet(KEY_PROGRESS, JSON.stringify(Object.keys(active.progress).map(function (slug) { return active.progress[slug]; })));
    safeSet(KEY_FOLLOWS, JSON.stringify(Object.keys(active.follows).map(function (slug) { return active.follows[slug]; })));
  }
  function clearGuestAfterMerge() {
    safeRemove(KEY_PROGRESS);
    safeRemove(KEY_FOLLOWS);
    safeRemove(LEGACY_FOLLOWS);
    try {
      var remove = [];
      for (var i = 0; i < w.localStorage.length; i++) {
        var key = w.localStorage.key(i) || '';
        if (key.indexOf(LEGACY_PROGRESS) === 0 || key.indexOf(LEGACY_WHEN) === 0) remove.push(key);
      }
      remove.forEach(safeRemove);
    } catch (e) {}
  }
  function emit(type, detail) {
    var data = Object.assign({ type: type, mode: active.mode, uid: active.uid || '' }, detail || {});
    try { w.dispatchEvent(new w.CustomEvent('cz:personal', { detail: data })); } catch (e) {}
  }
  function setGuest() {
    authUid = '';
    var local = guestData();
    active = { mode: 'guest', uid: '', progress: local.progress, follows: local.follows };
    currentTask = Promise.resolve(active);
    emit('ready');
    return currentTask;
  }
  function checkResult(result, label) {
    if (result && result.error) throw new Error((label || 'Supabase') + ': ' + (result.error.message || 'yêu cầu thất bại'));
    return result || {};
  }
  function supabaseSession(expectedUid) {
    if (!AUTH.getClient) return Promise.reject(new Error('CZ_AUTH chưa cung cấp client Supabase'));
    return AUTH.getClient().then(function (client) {
      return client.auth.getSession().then(function (result) {
        checkResult(result, 'Phiên Supabase');
        var session = result && result.data && result.data.session;
        if (!session || !session.access_token || !session.user || !session.user.id) throw new Error('Không tìm thấy phiên Supabase đang hoạt động');
        if (expectedUid && String(session.user.id) !== String(expectedUid)) throw new Error('UID phiên Supabase không khớp phiên đăng nhập');
        return { client: client, session: session };
      });
    });
  }
  function serverFollows(rows) {
    var out = Object.create(null);
    (rows || []).forEach(function (row) {
      var normalized = normalizeFollow(row);
      if (normalized) out[normalized.storyId] = normalized;
    });
    return out;
  }
  function serverProgress(rows) {
    var out = Object.create(null);
    (rows || []).forEach(function (row) {
      var normalized = normalizeProgress(row);
      if (normalized) out[normalized.storyId] = normalized;
    });
    return out;
  }
  function tableRows(client, table, select) {
    return client.from(table).select(select).then(function (result) {
      checkResult(result, 'Đọc ' + table);
      return (result && result.data) || [];
    });
  }
  function hydrate(uid, gen) {
    return supabaseSession(uid).then(function (ctx) {
      var cached = readUserCache(uid);
      var guest = guestData();
      var progressMerge = Object.create(null);
      mergeMap(progressMerge, guest.progress, true);
      mergeMap(progressMerge, cached.progress, true);
      var followMerge = Object.create(null);
      mergeMap(followMerge, guest.follows, false);
      mergeMap(followMerge, cached.follows, false);
      var client = ctx.client;
      return Promise.all([
        tableRows(client, 'story_follows', 'story_id,last_seen_chapter_index,created_at,last_seen_at'),
        tableRows(client, 'reading_progress', 'story_id,chapter_id,chapter_index,scroll_percent,completed_at,updated_at')
      ]).then(function (rows) {
        var follows = serverFollows(rows[0]);
        var progress = serverProgress(rows[1]);
        var addFollows = Object.keys(followMerge).filter(function (slug) { return !follows[slug]; }).map(function (slug) {
          var row = followMerge[slug];
          return {
            user_id: uid,
            story_id: slug,
            last_seen_chapter_index: row.lastSeenChapterIndex,
            created_at: row.createdAt,
            last_seen_at: row.lastSeenAt,
          };
        });
        var newerProgress = Object.keys(progressMerge).filter(function (slug) {
          return progressNewer(progressMerge[slug], progress[slug]);
        }).map(function (slug) {
          var row = progressMerge[slug];
          return {
            user_id: uid,
            story_id: slug,
            chapter_id: row.chapterId,
            chapter_index: row.chapterIndex,
            scroll_percent: row.scrollPercent,
            completed_at: row.completedAt,
            updated_at: row.updatedAt,
          };
        });
        var jobs = [];
        if (addFollows.length) {
          jobs.push(client.from('story_follows').upsert(addFollows, { onConflict: 'user_id,story_id', ignoreDuplicates: true }).then(function (r) { checkResult(r, 'Gộp danh sách theo dõi'); }));
        }
        if (newerProgress.length) {
          jobs.push(client.from('reading_progress').upsert(newerProgress, { onConflict: 'user_id,story_id' }).then(function (r) { checkResult(r, 'Gộp tiến độ đọc'); }));
        }
        return Promise.all(jobs).then(function () {
          return Promise.all([
            tableRows(client, 'story_follows', 'story_id,last_seen_chapter_index,created_at,last_seen_at'),
            tableRows(client, 'reading_progress', 'story_id,chapter_id,chapter_index,scroll_percent,completed_at,updated_at')
          ]);
        }).then(function (fresh) {
          /* Reader initialization may finish while auth hydration is still in
             flight. Re-read the UID cache + guest keys so a late local progress
             update joins this merge instead of disappearing at hydration. */
          var server = serverProgress(fresh[1]);
          var late = Object.create(null);
          var latestGuest = guestData();
          mergeMap(late, latestGuest.progress, true);
          mergeMap(late, readUserCache(uid).progress, true);
          var lateRows = Object.keys(late).filter(function (slug) { return progressNewer(late[slug], server[slug]); }).map(function (slug) {
            var row = late[slug];
            return { user_id: uid, story_id: slug, chapter_id: row.chapterId, chapter_index: row.chapterIndex,
              scroll_percent: row.scrollPercent, completed_at: row.completedAt, updated_at: row.updatedAt };
          });
          if (!lateRows.length) return fresh;
          return client.from('reading_progress').upsert(lateRows, { onConflict: 'user_id,story_id' }).then(function (r) {
            checkResult(r, 'Gộp tiến độ đọc mới phát sinh khi đồng bộ');
            return Promise.all([
              Promise.resolve(fresh[0]),
              tableRows(client, 'reading_progress', 'story_id,chapter_id,chapter_index,scroll_percent,completed_at,updated_at')
            ]);
          });
        }).then(function (fresh) {
          if (gen !== generation || authUid !== uid) return active;
          active = { mode: 'server', uid: uid, progress: serverProgress(fresh[1]), follows: serverFollows(fresh[0]) };
          saveUserCache(uid, active.progress, active.follows);
          clearGuestAfterMerge();
          currentTask = Promise.resolve(active);
          emit('ready');
          return active;
        });
      });
    });
  }
  function startUser(user) {
    var uid = String((user && (user.uid || user.id)) || '').trim();
    if (!uid) return setGuest();
    if (uid === authUid && (active.mode === 'loading' || active.mode === 'server')) return currentTask;
    authUid = uid;
    var gen = ++generation;
    active = { mode: 'loading', uid: uid, progress: Object.create(null), follows: Object.create(null) };
    emit('loading');
    currentTask = hydrate(uid, gen).catch(function (error) {
      if (gen !== generation || authUid !== uid) return active;
      active = { mode: 'error', uid: uid, progress: Object.create(null), follows: Object.create(null), error: String(error && error.message || error) };
      currentTask = Promise.resolve(active);
      emit('error', { error: active.error });
      return active;
    });
    return currentTask;
  }
  function authChanged(user) {
    if (user && (user.uid || user.id)) { startUser(user); return; }
    if (AUTH.state && AUTH.state() === 'checking') {
      if (active.mode !== 'loading') {
        generation++;
        authUid = '';
        active = { mode: 'loading', uid: '', progress: Object.create(null), follows: Object.create(null) };
        emit('loading');
      }
      if (AUTH.whenSettled) AUTH.whenSettled().then(function (settledUser) {
        if (settledUser && (settledUser.uid || settledUser.id)) startUser(settledUser);
        else if (active.mode === 'loading' && !authUid) setGuest();
      });
      return;
    }
    if (authUid || active.mode !== 'guest') generation++;
    setGuest();
  }
  if (AUTH.onAuth) AUTH.onAuth(authChanged);
  else setGuest();
  if (AUTH.whenSettled) AUTH.whenSettled().then(function (user) {
    if (user && (user.uid || user.id)) startUser(user);
    else if (active.mode === 'loading' && !authUid) setGuest();
  });

  function mode() { return active.mode; }
  function isServer() { return active.mode === 'server'; }
  function isFollowing(slug) { return !!active.follows[validSlug(slug)]; }
  function progressFor(slug) { return active.progress[validSlug(slug)] || null; }
  function progressRows() {
    return Object.keys(active.progress).map(function (slug) { return active.progress[slug]; })
      .sort(function (a, b) { return stamp(b.updatedAt) - stamp(a.updatedAt); });
  }
  function followRows() {
    return Object.keys(active.follows).map(function (slug) { return active.follows[slug]; })
      .sort(function (a, b) { return stamp(b.createdAt) - stamp(a.createdAt); });
  }
  function followMap() {
    var out = Object.create(null);
    Object.keys(active.follows).forEach(function (slug) { out[slug] = active.follows[slug].lastSeenChapterIndex; });
    return out;
  }
  function newChapters(slug, total) {
    var row = active.follows[validSlug(slug)];
    if (!row) return 0;
    var latest = clampNumber(total, 0, MAX_CHAPTER, 0);
    return Math.max(0, Math.floor(latest - row.lastSeenChapterIndex));
  }
  function getPosition(slug, chapterIndex) {
    var row = progressFor(slug);
    if (!row || (chapterIndex && row.chapterIndex !== Number(chapterIndex))) return 0;
    return row.scrollPercent;
  }
  function persistProgressRow(row, uid) {
    if (!uid || !row) return Promise.resolve(false);
    return supabaseSession(uid).then(function (ctx) {
      var client = ctx.client;
      return client.from('reading_progress').upsert([{
        user_id: uid,
        story_id: row.storyId,
        chapter_id: row.chapterId,
        chapter_index: row.chapterIndex,
        scroll_percent: row.scrollPercent,
        completed_at: row.completedAt,
        updated_at: row.updatedAt,
      }], { onConflict: 'user_id,story_id' }).then(function (result) {
        checkResult(result, 'Lưu tiến độ đọc');
        return client.from('reading_progress').select('story_id,chapter_id,chapter_index,scroll_percent,completed_at,updated_at').eq('story_id', row.storyId).then(function (savedRows) {
          checkResult(savedRows, 'Đọc lại tiến độ đã lưu');
          return (savedRows && savedRows.data) || [];
        });
      }).then(function (rows) {
        var saved = serverProgress(rows)[row.storyId];
        if (saved && active.mode === 'server' && active.uid === uid) {
          active.progress[row.storyId] = saved;
          emit('progress', { storyId: row.storyId, progress: saved });
        }
        return true;
      });
    });
  }
  function flushProgress(queueKey, slug, uid) {
    delete progressTimers[queueKey];
    var row = progressPending[queueKey];
    delete progressPending[queueKey];
    if (!row || active.mode !== 'server' || active.uid !== uid) return Promise.resolve(false);
    return persistProgressRow(row, uid).then(function (ok) {
      if (active.mode === 'server' && active.uid === uid) saveUserCache(uid, active.progress, active.follows);
      return ok;
    }).catch(function (error) {
      if (active.uid === uid) {
        saveUserCache(uid, active.progress, active.follows);
        emit('error', { error: String(error && error.message || error), operation: 'progress' });
      }
      return false; /* offline queue stays in the uid-scoped cache; no retry loop */
    });
  }
  function setProgress(slug, chapterIndex, scrollPercent, completed) {
    slug = validSlug(slug);
    chapterIndex = Math.floor(clampNumber(chapterIndex, 1, MAX_CHAPTER, 0));
    if (!slug || !chapterIndex) return null;
    var previous = active.progress[slug];
    var same = previous && previous.chapterIndex === chapterIndex;
    var hasPercent = scrollPercent !== undefined && scrollPercent !== null;
    var percent = hasPercent ? clampNumber(scrollPercent, 0, 100, 0) : (same ? previous.scrollPercent : 0);
    var done = completed === true ? new Date().toISOString()
      : (completed === false ? null : (same ? previous.completedAt : null));
    if (done) percent = Math.max(90, percent);
    var row = {
      storyId: slug,
      chapterId: 'ch-' + chapterIndex,
      chapterIndex: chapterIndex,
      scrollPercent: percent,
      completedAt: done,
      updatedAt: new Date().toISOString(),
    };
    active.progress[slug] = row;
    if (active.mode === 'guest') saveGuest();
    else if (active.mode === 'loading' && !active.uid) saveGuest(true);
    else if (active.uid) saveUserCache(active.uid, active.progress, active.follows);
    if (active.mode === 'server') {
      /* Include UID in the debounce key: logging out or changing account during
         the timer must never flush one reader's row into another UID. */
      var uid = active.uid;
      var queueKey = uid + '\u0000' + slug;
      progressPending[queueKey] = row;
      if (!progressTimers[queueKey]) progressTimers[queueKey] = setTimeout(function () { flushProgress(queueKey, slug, uid); }, UPSERT_DELAY);
    }
    emit('progress', { storyId: slug, progress: row });
    return row;
  }
  function toggleFollowAsync(slug) {
    slug = validSlug(slug);
    if (!slug) return Promise.reject(new Error('Truyện không hợp lệ'));
    if (followPending[slug]) return followPending[slug];
    if (active.mode === 'loading') return Promise.reject(new Error('Đang đồng bộ dữ liệu cá nhân — thử lại sau ít giây'));
    if (active.mode === 'error') return Promise.reject(new Error('Không tải được dữ liệu Supabase: ' + (active.error || 'lỗi kết nối')));
    var old = active.follows[slug] || null;
    var on = !old;
    var story = CZ.findLib ? CZ.findLib(slug) : null;
    var now = new Date().toISOString();
    if (on) {
      var count = story ? Math.max(0, Number(story.chapters) || 0) : 0;
      active.follows[slug] = { storyId: slug, lastSeenChapterIndex: count, createdAt: now, lastSeenAt: now };
    } else delete active.follows[slug];
    if (active.mode === 'guest') {
      saveGuest(); emit('follow', { storyId: slug, following: on });
      return Promise.resolve(on);
    }
    var uid = active.uid;
    emit('follow', { storyId: slug, following: on });
    var job;
    if (on) {
      var row = active.follows[slug];
      job = supabaseSession(uid).then(function (ctx) {
        return ctx.client.from('story_follows').insert({
          user_id: uid, story_id: slug,
          last_seen_chapter_index: row.lastSeenChapterIndex,
          created_at: row.createdAt,
          last_seen_at: row.lastSeenAt,
        }).then(function (result) { checkResult(result, 'Theo dõi truyện'); });
      });
    } else {
      job = supabaseSession(uid).then(function (ctx) {
        return ctx.client.from('story_follows').delete().eq('story_id', slug).then(function (result) { checkResult(result, 'Bỏ theo dõi'); });
      });
    }
    followPending[slug] = job.then(function () {
      delete followPending[slug];
      if (active.mode === 'server' && active.uid === uid) saveUserCache(uid, active.progress, active.follows);
      emit('follow', { storyId: slug, following: on });
      return on;
    }).catch(function (error) {
      delete followPending[slug];
      if (active.uid === uid) {
        if (old) active.follows[slug] = old; else delete active.follows[slug];
        saveUserCache(uid, active.progress, active.follows);
      }
      emit('follow', { storyId: slug, following: !!old, error: String(error && error.message || error) });
      throw error;
    });
    return followPending[slug];
  }
  function markFollowSeen(slug, chapters) {
    slug = validSlug(slug);
    var row = slug && active.follows[slug];
    if (!row) return Promise.resolve(false);
    var before = Object.assign({}, row);
    var nextIndex = Math.floor(clampNumber(chapters, 0, MAX_CHAPTER, row.lastSeenChapterIndex));
    if (nextIndex === before.lastSeenChapterIndex) return Promise.resolve(false);
    var next = Object.assign({}, row, {
      lastSeenChapterIndex: nextIndex,
      lastSeenAt: new Date().toISOString(),
    });
    active.follows[slug] = next;
    if (active.mode === 'guest') { saveGuest(); emit('follow-seen', { storyId: slug }); return Promise.resolve(true); }
    if (active.mode !== 'server') return Promise.resolve(false);
    var uid = active.uid;
    return supabaseSession(uid).then(function (ctx) {
      return ctx.client.from('story_follows').update({
        last_seen_chapter_index: next.lastSeenChapterIndex,
        last_seen_at: next.lastSeenAt,
      }).eq('story_id', slug).then(function (result) { checkResult(result, 'Cập nhật mốc chương đã xem'); });
    }).then(function () {
      if (active.mode === 'server' && active.uid === uid) saveUserCache(uid, active.progress, active.follows);
      emit('follow-seen', { storyId: slug });
      return true;
    }).catch(function (error) {
      if (active.uid === uid) active.follows[slug] = before;
      emit('error', { error: String(error && error.message || error), operation: 'follow-seen', storyId: slug });
      return false;
    });
  }
  function whenReady(timeoutMs) {
    var promise = currentTask || Promise.resolve(active);
    if (!timeoutMs || !Number.isFinite(Number(timeoutMs)) || Number(timeoutMs) <= 0) return promise;
    return Promise.race([promise, new Promise(function (resolve) { setTimeout(function () { resolve(active); }, Number(timeoutMs)); })]);
  }
  function authToken() {
    return supabaseSession(active.uid || (AUTH.current && AUTH.current() && AUTH.current().uid)).then(function (ctx) {
      return ctx.session.access_token;
    });
  }
  function communityRequest(path, body, options) {
    options = options || {};
    if (!CZ.API) return Promise.reject(new Error('Chưa kết nối Worker'));
    function send(token) {
      var headers = { 'content-type': 'application/json' };
      if (token) headers.authorization = 'Bearer ' + token;
      return w.fetch(CZ.API + path, {
        method: 'POST', headers: headers, cache: 'no-store', body: JSON.stringify(body || {})
      }).then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          return { response: response, data: data };
        });
      });
    }
    var visibleUser = AUTH.current && AUTH.current();
    var tokenJob = options.requireAuth
      ? authToken()
      : ((!visibleUser || active.mode === 'guest' || active.mode === 'loading' || active.mode === 'error') ? Promise.resolve('') : authToken().catch(function () { return ''; }));
    return tokenJob.then(function (token) {
      if (options.requireAuth && !token) throw new Error('Cần đăng nhập bằng Supabase để thực hiện thao tác này');
      return send(token).then(function (result) {
        if (result.response.status === 401 && token && !options.requireAuth && !options._retried) {
          return send('').then(function (retry) {
            if (!retry.response.ok || !retry.data || retry.data.ok === false) throw apiError(retry.response, retry.data);
            return retry.data;
          });
        }
        if (!result.response.ok || !result.data || result.data.ok === false) throw apiError(result.response, result.data);
        return result.data;
      });
    });
  }
  function apiError(response, data) {
    var error = new Error((data && data.error) || ('HTTP ' + (response && response.status || 0)));
    error.status = response && response.status || 0;
    error.data = data || {};
    return error;
  }
  function fetchTocs(slugs) {
    if (!CZ.API || !Array.isArray(slugs) || !slugs.length) return Promise.resolve(Object.create(null));
    var unique = Array.from(new Set(slugs.map(validSlug).filter(Boolean)));
    var now = Date.now();
    var missing = unique.filter(function (slug) { return !tocCache[slug] || (now - tocCache[slug].at) > CACHE_TTL; });
    var chunks = [];
    for (var i = 0; i < missing.length; i += 20) chunks.push(missing.slice(i, i + 20));
    return Promise.all(chunks.map(function (batch) {
      return w.fetch(CZ.API + '/api/community/tocs', {
        method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store',
        body: JSON.stringify({ storyIds: batch })
      }).then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          if (!response.ok || !data || data.ok === false) throw apiError(response, data);
          (data.items || []).forEach(function (item) {
            if (item && validSlug(item.storyId || item.slug)) tocCache[item.storyId || item.slug] = { at: Date.now(), item: item };
          });
        });
      });
    })).then(function () {
      var out = Object.create(null);
      unique.forEach(function (slug) { if (tocCache[slug]) out[slug] = tocCache[slug].item; });
      return out;
    }).catch(function () { return Object.create(null); });
  }

  w.CZPersonal = {
    mode: mode,
    isServer: isServer,
    uid: function () { return active.uid || ''; },
    isFollowing: isFollowing,
    progressFor: progressFor,
    progressRows: progressRows,
    followRows: followRows,
    followMap: followMap,
    newChapters: newChapters,
    getPosition: getPosition,
    setProgress: setProgress,
    toggleFollow: toggleFollowAsync,
    toggleFollowAsync: toggleFollowAsync,
    markFollowSeen: markFollowSeen,
    whenReady: whenReady,
    authToken: authToken,
    communityRequest: communityRequest,
    fetchTocs: fetchTocs,
    _keys: { progress: KEY_PROGRESS, follows: KEY_FOLLOWS, cacheProgressPrefix: CACHE_PROGRESS_PREFIX, cacheFollowsPrefix: CACHE_FOLLOWS_PREFIX },
    _normalizeProgress: normalizeProgress,
    _progressNewer: progressNewer,
  };
})(window);
