import { h, render } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { AdminApi, clearConnection, loadSavedConnection, normalizeApi, saveConnection, staticRegistry } from './api.js';
import { createAdminStore, initialState } from './store.js';
import { QuotaTracker } from './quota.js';
import { AuthGate } from './components/AuthGate.jsx';
import { Layout } from './components/Layout.jsx';
import { Overview } from './components/Overview.jsx';
import { BookList } from './components/BookList.jsx';
import { NewBook } from './components/NewBook.jsx';
import { BookEditor } from './components/BookEditor.jsx';
import { PlaceholderTab } from './components/PlaceholderTab.jsx';
import { DoctorPanel, CommentsPanel, ReportsPanel, StatsPanel, VotesPanel, LogPanel, SettingsPanel } from './components/OperationalPanels.jsx';
import { cloneRegistry, metaFromForm, newBookRecord, removeBookReferences, renameReferences, slugify, touchRegistry } from './utils/books.js';
import { compressImage } from './utils/images.js';
import { GenreManager } from './components/GenreManager.jsx';
import { HomepageCMS } from './components/HomepageCMS.jsx';
import { UsersPanel } from './components/UsersPanel.jsx';
import { RolesPanel } from './components/RolesPanel.jsx';
import { ChaptersHub } from './components/ChaptersHub.jsx';


const api = new AdminApi(loadSavedConnection());
const store = createAdminStore({ apiBase: loadSavedConnection().apiBase });
const quota = new QuotaTracker();

function cleanKey(value) { return String(value || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim(); }
function toast(message, kind) {
  if (window.CZ && window.CZ.toast) window.CZ.toast(message, kind);
  else console[kind === 'err' ? 'error' : 'log'](message);
}
function confirmBox(text, okLabel) {
  if (window.CZ && window.CZ.confirm) return window.CZ.confirm(text, okLabel);
  return Promise.resolve(window.confirm(text));
}
function staticBook(slug) {
  return fetch('/data/book/' + encodeURIComponent(slug) + '.json', { cache: 'no-store' })
    .then((res) => res.ok ? res.json() : null).catch(() => null);
}
function downloadJSON(filename, data) {
  const text = JSON.stringify(data, null, 2) + '\n';
  if (window.CZ && window.CZ.download) return window.CZ.download(filename, text);
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function stripLockForBackup(book) {
  if (!book || typeof book !== 'object') return book;
  const copy = JSON.parse(JSON.stringify(book));
  if (copy.lock) copy.lockStripped = true;
  delete copy.lock;
  return copy;
}
function stripRegistryForBackup(registry) {
  const copy = JSON.parse(JSON.stringify(registry || { lib: [] }));
  if (copy.settings) {
    if (Array.isArray(copy.settings.staff)) {
      copy.settings.staff = copy.settings.staff.map((s) => ({ role: s.role, name: s.name || 'staff' }));
    }
    if (copy.settings.auth) {
      const auth = Object.assign({}, copy.settings.auth);
      delete auth.supabaseAnonKey; delete auth.serviceRole; delete auth.adminKey;
      copy.settings.auth = auth;
    }
  }
  return copy;
}
function classifyConnError(error) {
  const status = error && error.httpStatus;
  const msg = String((error && error.message) || error || '');
  if (status === 401 || status === 403 || /unauthor|forbidden|sai.*(key|khoá|khoa)|ADMIN_KEY|invalid key/i.test(msg)) return 'badkey';
  return 'network';
}

function App() {
  const [state, setState] = useState(store.getState());
  const [activeTab, setActiveTab] = useState('overview');
  const [busy, setBusy] = useState(false);
  const [gateMessage, setGateMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState({});
  const [currentSlug, setCurrentSlug] = useState('');
  const [bookCache, setBookCache] = useState({});
  const [bookLoading, setBookLoading] = useState(false);
  const [listQuery, setListQuery] = useState('');

  useEffect(() => store.subscribe(setState), []);
  useEffect(() => quota.subscribe((snap) => store.setState({ quota: snap })), []);

  async function loadRegistryFromCurrent(nextOnline = store.getState().online) {
    store.setState({ loading: true, error: '' });
    try {
      const registry = nextOnline ? await api.registry() : await staticRegistry();
      registry.lib = registry.lib || [];
      store.setState({ registry, loading: false });
      return registry;
    } catch (error) {
      store.setState({ loading: false, error: error.message || String(error) });
      throw error;
    }
  }

  async function loadOperationalCounts() {
    if (!store.getState().online) return;
    const [reports, comments, stats] = await Promise.allSettled([api.adminReports(), api.adminComments(800), api.adminStats()]);
    if (reports.status === 'fulfilled') {
      const value = reports.value || {};
      const items = value.items || [];
      store.setState({ reports: { count: Number(value.count != null ? value.count : items.length) || 0, open: Number(value.open != null ? value.open : items.filter((x) => !x.done).length) || 0, items, loaded: true } });
    }
    if (comments.status === 'fulfilled') {
      const value = comments.value || {};
      store.setState({ comments: { count: Number(value.count != null ? value.count : (value.comments || []).length) || 0, items: value.comments || [], loaded: true } });
    }
    /* số liệu thật cho Overview (trước đây tiles lượt đọc/phiếu luôn = 0 vì
       không ai nạp adminStats vào store) */
    if (stats.status === 'fulfilled' && stats.value) {
      store.setState({ stats: { items: stats.value.items || {}, days: stats.value.days || [], updatedAt: stats.value.updatedAt || '', loaded: true } });
    }
  }

  function ensureQuota(cost, label) {
    if (!quota.canProceed(cost)) throw new Error(`Quota KV hôm nay không đủ cho thao tác “${label}” (${cost} lượt ghi).`);
  }
  function trackQuotaWrite(cost, label) {
    const before = quota.snapshot();
    const snap = quota.trackWrite(cost);
    if (snap.writesToday >= snap.limit) {
      toast(`Quota KV đã hết: ${snap.writesToday}/${snap.limit} sau “${label}”. Đã chặn ghi tiếp.`, 'err');
    } else if (snap.writesToday >= snap.criticalThreshold) {
      toast(`Cảnh báo KV write: ${snap.writesToday}/${snap.limit} sau “${label}”. Gần chạm trần free tier, nên dừng các thao tác ghi lớn.`, 'err');
    } else if (before.writesToday < snap.warningThreshold && snap.writesToday >= snap.warningThreshold) {
      toast(`Cảnh báo KV write: ${snap.writesToday}/${snap.limit}. Hôm nay đã qua ngưỡng an toàn, cân nhắc backup rồi dừng ghi lớn.`, 'err');
    }
    return snap;
  }
  function pushAudit(entry) {
    const row = Object.assign({ at: new Date().toISOString(), who: state.online ? 'admin-key' : 'session' }, entry);
    const audit = [row].concat(store.getState().audit || []).slice(0, 200);
    store.setState({ audit });
  }
  async function writeRegistry(registry, okMsg = 'Đã lưu thư viện') {
    const next = touchRegistry(registry);
    if (state.online) {
      ensureQuota(1, okMsg);
      await api.putRegistry(next);
      trackQuotaWrite(1, okMsg);
    }
    store.setState({ registry: next, pendingRegistry: null, partialError: '' });
    toast(state.online ? okMsg : okMsg + ' (bản nháp trong phiên admin v2)', 'ok');
    pushAudit({ action: 'registry', text: okMsg, result: state.online ? 'ok' : 'draft' });
    return next;
  }
  async function putBook(slug, book, label = 'ghi bộ') {
    if (!state.online) return null;
    ensureQuota(1, label);
    const res = await api.putBook(slug, book);
    trackQuotaWrite(1, label);
    return res;
  }
  async function deleteBookKv(slug) {
    if (!state.online) return null;
    ensureQuota(1, 'xoá bộ trên KV');
    const res = await api.deleteBook(slug);
    trackQuotaWrite(1, 'xoá bộ trên KV');
    return res;
  }
  async function persistBookAndRegistry(slug, book, registry, okMsg) {
    const next = touchRegistry(registry);
    if (state.online) {
      ensureQuota(2, okMsg || 'ghi book + registry');
      await putBook(slug, book, 'ghi book');
      try {
        await api.putRegistry(next);
        trackQuotaWrite(1, 'ghi registry');
      } catch (error) {
        store.setState({ registry: next, pendingRegistry: next, partialError: (error && error.message) || String(error) });
        pushAudit({ action: 'partial', text: 'book:' + slug, result: 'book-ok', error: (error && error.message) || String(error) });
        toast('Book đã ghi nhưng registry thất bại — không báo lưu hoàn tất. Bấm Thử lại registry.', 'err');
        throw error;
      }
    }
    store.setState({ registry: next, pendingRegistry: null, partialError: '' });
    toast(state.online ? 'Đã ghi book + registry' : (okMsg || 'Đã lưu') + ' (nháp phiên)', 'ok');
    pushAudit({ action: 'book+registry', text: okMsg || slug, result: state.online ? 'ok' : 'draft' });
    return next;
  }
  async function retryPendingRegistry() {
    const pending = store.getState().pendingRegistry;
    if (!pending) return;
    try {
      await writeRegistry(pending, 'Đã ghi book + registry');
    } catch (error) {
      toast('Thử lại registry lỗi: ' + (error.message || error), 'err');
    }
  }
  async function uploadImage(file, options = {}) {
    if (!state.online) throw new Error('Upload ảnh cần nối Worker bằng ADMIN_KEY.');
    const packed = await compressImage(file, options);
    ensureQuota(1, 'upload ảnh');
    const res = await api.postImage(packed);
    trackQuotaWrite(1, 'upload ảnh');
    if (!res || !res.url) throw new Error('Worker không trả URL ảnh.');
    toast('Đã lên ảnh ' + Math.max(1, Math.round((res.bytes || packed.bytes || 0) / 1024)) + ' KB', 'ok');
    return (/^\/api\//.test(res.url) && api.apiBase) ? api.apiBase + res.url : res.url;
  }
  async function getBook(slug) {
    if (bookCache[slug]) return bookCache[slug];
    const book = state.online ? await api.book(slug).catch(() => null) : await staticBook(slug);
    setBookCache((prev) => Object.assign({}, prev, { [slug]: book }));
    return book;
  }
  async function loadBookForEdit(slug) {
    if (!slug) return null;
    setBookLoading(true);
    try { return await getBook(slug); }
    finally { setBookLoading(false); }
  }

  async function enterStatic(mode = 'local', quiet = false) {
    setBusy(true); setGateMessage('');
    try {
      api.setConnection({ apiBase: '', adminKey: '' });
      store.setState({ mode, role: mode === 'login' ? 'admin' : 'local', online: false, worker: null, apiBase: '', quota: quota.snapshot(), connecting: false, connError: '' });
      await loadRegistryFromCurrent(false);
      if (!quiet) setNotice('Đang xem dữ liệu tĩnh trong repo. Admin v2 chỉ ghi khi bạn nối Worker bằng ADMIN_KEY.');
    } catch (error) { setGateMessage(error.message || String(error)); }
    finally { setBusy(false); }
  }

  async function connect(apiInput, keyInput, quiet = false) {
    const apiBase = normalizeApi(apiInput);
    const adminKey = cleanKey(keyInput);
    if (!apiBase) { setGateMessage('Nhập URL Worker đã.'); return; }
    if (!adminKey) { setGateMessage('Nhập ADMIN_KEY đã.'); return; }
    setBusy(true); setGateMessage('');
    store.setState({ connecting: true, connError: '' });
    try {
      api.setConnection({ apiBase, adminKey });
      const health = await api.health();
      if (health.adminConfigured === false) throw new Error('Worker chưa nhận secret ADMIN_KEY.');
      const who = await api.whoami();
      saveConnection(apiBase, adminKey);
      store.setState({ mode: 'key', role: who.role || 'admin', permissions: who.permissions || ['*'], online: true, apiBase, worker: health, error: '', connecting: false, connError: '' });
      await loadRegistryFromCurrent(true);
      quota.init(api).then((snap) => store.setState({ quota: snap })).catch(() => {});
      loadOperationalCounts().catch(() => {});
      if (!quiet) toast('Kết nối Admin v2 OK', 'ok');
    } catch (error) {
      api.setConnection({ apiBase: '', adminKey: '' });
      const kind = classifyConnError(error);
      setGateMessage(error.message || String(error));
      store.setState({ online: false, mode: '', worker: null, connecting: false, connError: kind });
    } finally { setBusy(false); }
  }

  async function login() {
    setBusy(true); setGateMessage('');
    try {
      if (!window.CZ_AUTH || !window.CZ_AUTH.login) throw new Error('CZ_AUTH chưa sẵn sàng.');
      await window.CZ_AUTH.login();
      const isAdmin = window.CZ_AUTH && window.CZ_AUTH.isAdmin && window.CZ_AUTH.isAdmin();
      if (!isAdmin) throw new Error('Tài khoản này chưa được Worker cấp quyền quản trị.');
      await enterStatic('login', true);
      setNotice('Đã vào bằng tài khoản quản trị. Để ghi KV, nối thêm Worker bằng ADMIN_KEY (backend hiện chưa có RBAC/Bearer cho admin API).');
    } catch (error) { setGateMessage(error.message || String(error)); }
    finally { setBusy(false); }
  }

  function disconnect() {
    clearConnection();
    const fallbackApi = (window.CZ && window.CZ.API) || '';
    api.setConnection({ apiBase: fallbackApi, adminKey: '' });
    store.setState(Object.assign({}, initialState, { apiBase: fallbackApi }));
    setNotice(''); setGateMessage(''); setActiveTab('overview'); setCurrentSlug(''); setSelected({});
  }

  async function reload() {
    try {
      if (state.online) {
        const health = await api.health().catch(() => null);
        if (health) store.setState({ worker: health });
      }
      await loadRegistryFromCurrent(state.online);
      if (state.online) loadOperationalCounts().catch(() => {});
      toast('Đã đọc lại dữ liệu', 'ok');
    } catch (error) { toast('Không đọc lại được: ' + (error.message || error), 'err'); }
  }

  async function createBook(values) {
    try {
      const { meta, book } = newBookRecord(values);
      if (!meta.title || !meta.slug) throw new Error('Tên truyện/slug chưa hợp lệ.');
      const registry = cloneRegistry(state.registry);
      if ((registry.lib || []).some((item) => item.slug === meta.slug)) throw new Error('Slug đã tồn tại: ' + meta.slug);
      registry.lib = registry.lib || [];
      registry.lib.push(meta);
      await persistBookAndRegistry(meta.slug, book, registry, 'Đã tạo truyện “' + meta.title + '”');
      setBookCache((prev) => Object.assign({}, prev, { [meta.slug]: book }));
      setCurrentSlug(meta.slug); setActiveTab('edit');
      return true;
    } catch (error) { toast('Tạo truyện lỗi: ' + (error.message || error), 'err'); return false; }
  }

  async function saveMeta(oldSlug, values) {
    try {
      const registry = cloneRegistry(state.registry);
      const list = registry.lib || [];
      const index = list.findIndex((item) => item.slug === oldSlug);
      if (index < 0) throw new Error('Không tìm thấy bộ cần lưu.');
      const nextSlug = values.slug;
      if (!nextSlug) throw new Error('Slug không được để trống.');
      if (nextSlug !== oldSlug && list.some((item) => item.slug === nextSlug)) throw new Error('Slug đã tồn tại: ' + nextSlug);
      const nextMeta = metaFromForm(list[index], values);
      list[index] = nextMeta;
      if (nextSlug !== oldSlug) renameReferences(registry, oldSlug, nextSlug);
      if (state.online && nextSlug !== oldSlug) {
        const book = await getBook(oldSlug);
        if (book) {
          const moved = Object.assign({}, book, { slug: nextSlug, title: nextMeta.title, author: nextMeta.author, couple: nextMeta.couple });
          await putBook(nextSlug, moved, 'đổi slug: ghi book mới');
          try {
            await writeRegistry(registry, 'Đã ghi book + registry');
          } catch (error) {
            toast('Đã ghi book:' + nextSlug + ' nhưng registry chưa đổi. Chưa xoá book cũ. Thử lại registry.', 'err');
            throw error;
          }
          await deleteBookKv(oldSlug).catch((e) => { toast('Registry đã đổi nhưng chưa xoá book cũ: ' + (e.message || e), 'err'); });
          setBookCache((prev) => {
            const next = Object.assign({}, prev, { [nextSlug]: moved });
            delete next[oldSlug];
            return next;
          });
          setCurrentSlug(nextSlug); setActiveTab('edit');
          return;
        }
      }
      await writeRegistry(registry, state.online ? 'Đã lưu registry' : 'Đã lưu thông tin “' + nextMeta.title + '” (nháp phiên)');
      setCurrentSlug(nextSlug); setActiveTab('edit');
    } catch (error) { toast('Lưu metadata lỗi: ' + (error.message || error), 'err'); }
  }

  async function saveBookChapters(nextBook) {
    try {
      if (!nextBook || !nextBook.slug) throw new Error('Thiếu dữ liệu book.');
      nextBook = Object.assign({}, nextBook, { chapters: Array.isArray(nextBook.chapters) ? nextBook.chapters : [] });
      const registry = cloneRegistry(state.registry);
      const meta = (registry.lib || []).find((item) => item.slug === nextBook.slug);
      if (meta) {
        meta.chapters = nextBook.chapters.length;
        const raw = String(meta.countLabel || '');
        const plannedRaw = raw.split('/')[1] || '';
        const planned = plannedRaw.trim() === '—' ? 0 : (parseInt(plannedRaw, 10) || 0);
        meta.countLabel = nextBook.chapters.length ? (nextBook.chapters.length + '/' + Math.max(planned, nextBook.chapters.length)) : (planned > 0 ? '0/' + planned : '0/—');
        meta.updated = new Date().toISOString().slice(0, 10);
      }
      await persistBookAndRegistry(nextBook.slug, nextBook, registry, 'Đã lưu chương “' + (meta && meta.title || nextBook.title || nextBook.slug) + '”');
      setBookCache((prev) => Object.assign({}, prev, { [nextBook.slug]: nextBook }));
    } catch (error) { toast('Lưu chương lỗi: ' + (error.message || error), 'err'); throw error; }
  }

  async function setBookLock(slug, password) {
    try {
      if (!state.online) throw new Error('Khóa mật mã cần nối Worker bằng ADMIN_KEY.');
      ensureQuota(4, password ? 'khóa/đổi mật mã' : 'bỏ khóa mật mã');
      const res = await api.lockSet(slug, password || '');
      trackQuotaWrite(4, password ? 'khóa/đổi mật mã' : 'bỏ khóa mật mã');
      const registry = cloneRegistry(store.getState().registry || state.registry);
      const item = (registry.lib || []).find((book) => book.slug === slug);
      if (item) { if (res && res.locked) item.lock = 1; else delete item.lock; }
      store.setState({ registry });
      toast(res && res.locked ? 'Đã đặt/đổi mật mã.' : 'Đã bỏ khóa mật mã.', 'ok');
      return res;
    } catch (error) { toast('Khóa mật mã lỗi: ' + (error.message || error), 'err'); throw error; }
  }

  async function unlockBook(slug) {
    const ok = await confirmBox('Bỏ khóa mật mã cho “' + slug + '”? Người đọc sẽ mở chương không cần mật mã.', 'Bỏ khóa');
    if (!ok) return;
    const typed = window.prompt('Gõ đúng slug để xác nhận bỏ khóa:', '');
    if (typed !== slug) { toast('Đã huỷ bỏ khóa: slug xác nhận không khớp.', 'err'); return; }
    return setBookLock(slug, '');
  }

  async function duplicateBook(slug) {
    const src = ((state.registry && state.registry.lib) || []).find((book) => book.slug === slug);
    if (!src) return;
    const suggested = slugify(src.slug + '-ban-sao');
    const raw = window.prompt('Slug cho bản nhân bản:', suggested);
    if (raw == null) return;
    const nextSlug = slugify(raw);
    if (!nextSlug) { toast('Slug nhân bản chưa hợp lệ.', 'err'); return; }
    const registryNow = store.getState().registry || state.registry;
    if (((registryNow && registryNow.lib) || []).some((book) => book.slug === nextSlug)) { toast('Slug đã tồn tại: ' + nextSlug, 'err'); return; }
    const ok = await confirmBox('Nhân bản “' + src.title + '” thành slug “' + nextSlug + '”?', 'Nhân bản');
    if (!ok) return;
    try {
      const registry = cloneRegistry(registryNow);
      const nextMeta = Object.assign({}, src, {
        title: (src.title || src.slug) + ' (bản sao)',
        slug: nextSlug,
        updated: new Date().toISOString().slice(0, 10),
      });
      delete nextMeta.lock;
      registry.lib = registry.lib || [];
      registry.lib.push(nextMeta);
      const srcBook = await getBook(slug);
      const nextBook = srcBook ? JSON.parse(JSON.stringify(srcBook)) : { slug: nextSlug, title: nextMeta.title, chapters: [] };
      nextBook.slug = nextSlug;
      nextBook.title = nextMeta.title;
      if (nextBook.lock) delete nextBook.lock;
      await persistBookAndRegistry(nextSlug, nextBook, registry, 'Đã nhân bản “' + src.title + '”');
      setBookCache((prev) => Object.assign({}, prev, { [nextSlug]: nextBook }));
      setCurrentSlug(nextSlug); setActiveTab('edit');
    } catch (error) { toast('Nhân bản lỗi: ' + (error.message || error), 'err'); }
  }

  async function refreshComments() {
    if (!state.online) throw new Error('Cần nối Worker để đọc bình luận.');
    try {
      const value = await api.adminComments(800);
      store.setState({ comments: { count: Number(value.count != null ? value.count : (value.comments || []).length) || 0, items: value.comments || [], loaded: true, slugs: value.slugs || 0, fallback: false } });
      return value;
    } catch (error) {
      if (String(error && error.httpStatus) !== '404') throw error;
      const items = [];
      const lib = ((store.getState().registry || state.registry || {}).lib) || [];
      for (const book of lib) {
        if (!book.slug) continue;
        try {
          const value = await api.request('/api/comments/' + encodeURIComponent(book.slug) + '?limit=200', { auth: false });
          (value.comments || []).forEach((comment) => items.push(Object.assign({ slug: book.slug }, comment)));
        } catch (e) {}
      }
      items.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      store.setState({ comments: { count: items.length, items, loaded: true, slugs: lib.length, fallback: true } });
      toast('Worker chưa có /api/admin/comments, đã gom bình luận từng bộ.', 'info');
      return { ok: true, comments: items, count: items.length, slugs: lib.length, fallback: true };
    }
  }

  async function deleteComment(slug, id) {
    const ok = await confirmBox('Xoá bình luận này khỏi KV? Không khôi phục được.', 'Xoá');
    if (!ok) return;
    const typed = window.prompt('Gõ XOÁ để xác nhận xoá bình luận:', '');
    if (typed !== 'XOÁ') { toast('Đã huỷ xoá bình luận.', 'err'); return; }
    try {
      ensureQuota(2, 'xoá bình luận');
      await api.deleteComment(slug, id);
      trackQuotaWrite(2, 'xoá bình luận');
      const cur = store.getState().comments || {};
      const items = (cur.items || []).filter((c) => !(c.slug === slug && c.id === id));
      store.setState({ comments: Object.assign({}, cur, { items, count: items.length, loaded: true }) });
      toast('Đã xoá bình luận', 'ok');
    } catch (error) { toast('Xoá bình luận lỗi: ' + (error.message || error), 'err'); }
  }

  async function refreshReports(query = '') {
    if (!state.online) throw new Error('Cần nối Worker để đọc báo lỗi.');
    const value = await api.adminReports(query);
    const items = value.items || [];
    store.setState({ reports: { count: Number(value.count != null ? value.count : items.length) || 0, open: Number(value.open != null ? value.open : items.filter((x) => !x.done).length) || 0, items, loaded: true, mail: !!value.mail } });
    return value;
  }

  /* đánh dấu đã xử lý / mở lại 1 báo lỗi (PATCH /api/admin/reports) */
  async function markReport(id, done) {
    if (!state.online) throw new Error('Cần nối Worker để đổi trạng thái báo lỗi.');
    ensureQuota(2, done ? 'đánh dấu đã xử lý' : 'mở lại báo lỗi');
    const res = await api.patchReport(id, done);
    trackQuotaWrite(2, done ? 'đánh dấu đã xử lý' : 'mở lại báo lỗi');
    const cur = store.getState().reports || {};
    const items = (cur.items || []).map((x) => (x.id === id ? Object.assign({}, x, { done, doneAt: res && res.doneAt }) : x));
    const open = Number(res && res.open != null ? res.open : items.filter((x) => !x.done).length) || 0;
    store.setState({ reports: Object.assign({}, cur, { items, open, loaded: true }) });
    toast(done ? 'Đã đánh dấu xử lý xong.' : 'Đã mở lại báo lỗi.', 'ok');
    return res;
  }

  async function loadAdminStats() {
    if (!state.online) throw new Error('Cần nối Worker để đọc thống kê.');
    return api.adminStats();
  }

  async function loadAdminLog() {
    if (!state.online) throw new Error('Cần nối Worker để đọc nhật ký.');
    return api.adminLog();
  }

  async function loadKvAudit() {
    if (!state.online) throw new Error('Cần nối Worker để audit KV.');
    return api.kvStats();
  }

  async function scanBooks() {
    const registry = store.getState().registry || state.registry;
    const lib = (registry && registry.lib) || [];
    const rows = [];
    let missing = 0, mismatch = 0, empty = 0, locked = 0;
    for (const meta of lib) {
      if (!meta || !meta.slug) continue;
      let book = null;
      try { book = await getBook(meta.slug); } catch (e) { book = null; }
      if (!book) {
        missing++;
        rows.push({ slug: meta.slug, title: meta.title || meta.slug, issue: 'Thiếu book JSON/KV', registry: Number(meta.chapters) || 0, actual: null });
        continue;
      }
      if (book.lock) locked++;
      const chapters = Array.isArray(book.chapters) ? book.chapters : [];
      const actual = chapters.length;
      const registryCount = Number(meta.chapters) || parseInt(String(meta.countLabel || '').split('/')[0], 10) || 0;
      const emptyChapters = chapters.filter((chapter) => !String((chapter && (chapter.html || chapter.text || chapter.body)) || '').replace(/<[^>]*>/g, '').trim()).length;
      if (actual !== registryCount) {
        mismatch++;
        rows.push({ slug: meta.slug, title: meta.title || meta.slug, issue: 'Lệch số chương', registry: registryCount, actual });
      }
      if (emptyChapters) {
        empty += emptyChapters;
        rows.push({ slug: meta.slug, title: meta.title || meta.slug, issue: emptyChapters + ' chương rỗng', registry: registryCount, actual });
      }
    }
    return { ok: true, scanned: lib.length, missing, mismatch, empty, locked, rows: rows.slice(0, 120), source: state.online ? 'worker-kv' : 'static-files' };
  }

  async function fixScanIssue(row) {
    if (!row || !row.slug) throw new Error('Thiếu dòng lỗi.');
    if (!state.online) throw new Error('Sửa dữ liệu cần nối Worker bằng ADMIN_KEY.');
    const registry = cloneRegistry(store.getState().registry || state.registry);
    const meta = (registry.lib || []).find((item) => item.slug === row.slug);
    if (row.issue === 'Thiếu book JSON/KV') {
      if (!meta) throw new Error('Registry không còn bộ này.');
      const book = { title: meta.title || row.slug, slug: row.slug, author: meta.author || '', couple: meta.couple || '', chapters: [] };
      await putBook(row.slug, book, 'tạo book thiếu');
      setBookCache((prev) => Object.assign({}, prev, { [row.slug]: book }));
      toast('Đã tạo book trống cho “' + (meta.title || row.slug) + '”.', 'ok');
      return { ok: true, fixed: 'missing' };
    }
    if (row.issue === 'Lệch số chương') {
      if (!meta) throw new Error('Registry không còn bộ này.');
      const actual = Number(row.actual);
      if (!Number.isFinite(actual) || actual < 0) throw new Error('Không có số chương thật để khớp.');
      meta.chapters = actual;
      const plannedRaw = String(meta.countLabel || '').split('/')[1] || '';
      const planned = plannedRaw.trim() === '—' ? 0 : (parseInt(plannedRaw, 10) || 0);
      meta.countLabel = actual ? (actual + '/' + Math.max(planned, actual)) : (planned > 0 ? '0/' + planned : '0/—');
      await writeRegistry(registry, 'Đã khớp số chương “' + (meta.title || row.slug) + '”');
      return { ok: true, fixed: 'mismatch' };
    }
    toast('Chương rỗng cần mở bộ và sửa tay — không tự xoá nội dung.', 'info');
    return { ok: false, skipped: true };
  }

  async function runRecount() {
    const ok = await confirmBox('Đếm lại số chương từ toàn bộ book trong KV? Thao tác có thể ghi registry nếu phát hiện lệch.', 'Đếm lại');
    if (!ok) return;
    const typed = window.prompt('Gõ ĐẾM LẠI để xác nhận thao tác ghi:', '');
    if (typed !== 'ĐẾM LẠI') { toast('Đã huỷ đếm lại.', 'err'); return; }
    try {
      ensureQuota(3, 'đếm lại số chương');
      const res = await api.recount();
      trackQuotaWrite(3, 'đếm lại số chương');
      toast('Đếm lại xong: sửa ' + ((res.fixed || []).length) + ' bộ, thiếu ' + ((res.missing || []).length) + ' book.', 'ok');
      await loadRegistryFromCurrent(true);
      return res;
    } catch (error) { toast('Đếm lại lỗi: ' + (error.message || error), 'err'); }
  }

  async function runStatsRefresh() {
    const ok = await confirmBox('Flush stats cache đang đệm vào KV? Đây là thao tác ghi.', 'Flush stats');
    if (!ok) return;
    try {
      ensureQuota(2, 'flush stats');
      const res = await api.statsRefresh();
      trackQuotaWrite(2, 'flush stats');
      toast('Đã flush stats cache.', 'ok');
      return res;
    } catch (error) { toast('Flush stats lỗi: ' + (error.message || error), 'err'); }
  }

  async function importBloggerChapter(values) {
    const slug = values && values.slug;
    if (!slug) throw new Error('Chọn bộ cần nhập chương.');
    const ok = await confirmBox('Nhập một bài Blogger vào bộ “' + slug + '”? Worker sẽ làm sạch HTML rồi ghi book + registry.', 'Nhập chương');
    if (!ok) return null;
    try {
      ensureQuota(6, 'nhập chương Blogger');
      const res = await api.importPost(slug, values.url || '', values.mode || 'append');
      trackQuotaWrite(6, 'nhập chương Blogger');
      toast('Đã nhập: ' + (res.added || res.title || slug), 'ok');
      setBookCache((prev) => {
        const next = Object.assign({}, prev);
        delete next[slug];
        return next;
      });
      await loadRegistryFromCurrent(true);
      if (currentSlug === slug) loadBookForEdit(slug).catch(() => {});
      return res;
    } catch (error) { toast('Nhập Blogger lỗi: ' + (error.message || error), 'err'); throw error; }
  }

  async function syncFromBlogger() {
    const ok = await confirmBox('Đồng bộ metadata từ Blogger list-novel + lịch ra chương? Registry KV có thể thay đổi.', 'Đồng bộ');
    if (!ok) return null;
    const typed = window.prompt('Gõ ĐỒNG BỘ để xác nhận ghi registry:', '');
    if (typed !== 'ĐỒNG BỘ') { toast('Đã huỷ đồng bộ.', 'err'); return null; }
    try {
      ensureQuota(4, 'đồng bộ Blogger');
      const res = await api.syncBlogger();
      trackQuotaWrite(4, 'đồng bộ Blogger');
      toast('Đồng bộ xong: ' + (res.changed || 0) + ' thay đổi từ ' + (res.cards || 0) + ' thẻ.', 'ok');
      await loadRegistryFromCurrent(true);
      return res;
    } catch (error) { toast('Đồng bộ Blogger lỗi: ' + (error.message || error), 'err'); throw error; }
  }

  async function downloadBackup() {
    const registry = store.getState().registry || state.registry;
    const lib = (registry && registry.lib) || [];
    const ok = await confirmBox('Tải một file backup JSON gồm registry và ' + lib.length + ' book? Thao tác chỉ đọc KV, không ghi.', 'Tải backup');
    if (!ok) return null;
    const books = {};
    let fail = 0;
    for (const item of lib) {
      if (!item.slug) continue;
      try {
        const book = await getBook(item.slug);
        if (book) books[item.slug] = stripLockForBackup(book);
      } catch (e) { fail++; }
    }
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const payload = { at: new Date().toISOString(), note: 'Admin v2 backup: registry + book JSON; lock hash and staff email stripped by default.', registry: stripRegistryForBackup(registry), books, failedBooks: fail };
    const file = 'ssochuz-admin-v2-backup-' + stamp + '.json';
    downloadJSON(file, payload);
    toast('Đã tạo backup: ' + Object.keys(books).length + ' book' + (fail ? ', lỗi ' + fail : ''), fail ? 'err' : 'ok');
    return { ok: true, file, books: Object.keys(books).length, failedBooks: fail };
  }

  /* Khôi phục từ file backup (đối trọng của "Tải backup JSON"): đọc file, kiểm
     tra shape, hỏi xác nhận mạnh rồi ghi registry + từng book qua endpoint cũ. */
  async function restoreBackup(file) {
    if (!state.online) throw new Error('Khôi phục backup cần nối Worker bằng ADMIN_KEY.');
    if (!file) throw new Error('Chưa chọn file backup.');
    let payload = null;
    try { payload = JSON.parse(await file.text()); }
    catch (e) { throw new Error('File không phải JSON đọc được: ' + (e.message || e)); }
    const reg = payload && payload.registry;
    const books = payload && payload.books;
    if (!reg || !Array.isArray(reg.lib) || typeof books !== 'object' || books == null) {
      throw new Error('File backup sai dạng — thiếu registry.lib hoặc books.');
    }
    const slugs = Object.keys(books).filter((k) => books[k] && books[k].slug);
    const writes = 1 + slugs.length;
    const ok = await confirmBox('Khôi phục registry (' + reg.lib.length + ' bộ) + ' + slugs.length + ' book đè lên dữ liệu KV hiện tại? Ước lượng ' + writes + ' lượt ghi KV. Thao tác ghi hàng loạt, chỉ dùng khi đang khôi phục sau sự cố.', 'Khôi phục');
    if (!ok) return null;
    const typed = window.prompt('Gõ KHÔI PHỤC để xác nhận ghi đè KV:', '');
    if (typed !== 'KHÔI PHỤC') { toast('Đã huỷ khôi phục.', 'err'); return null; }
    const cost = 1 + slugs.length;
    ensureQuota(cost, 'khôi phục backup');
    await api.putRegistry(reg);
    trackQuotaWrite(1, 'khôi phục registry');
    let done = 0, fail = 0;
    for (const slug of slugs) {
      try { await api.putBook(slug, books[slug]); trackQuotaWrite(1, 'khôi phục ' + slug); done++; }
      catch (e) { fail++; toast('Lỗi ghi bộ “' + slug + '”: ' + (e.message || e), 'err'); }
    }
    setBookCache({});
    await loadRegistryFromCurrent(true);
    toast('Khôi phục xong: registry + ' + done + '/' + slugs.length + ' book' + (fail ? ' (lỗi ' + fail + ')' : ''), fail ? 'err' : 'ok');
    return { ok: !fail, registry: reg.lib.length, books: done, failed: fail };
  }

  async function loadVoters(slug) {
    if (!state.online) throw new Error('Cần nối Worker để đọc phiếu bầu.');
    return api.adminVoters(slug);
  }

  async function removeVotes(slug, keys) {
    if (!keys || !keys.length) return;
    const byCh = {};
    keys.forEach((key) => {
      const m = String(key).match(/#(\d+)$/);
      const ch = m ? Number(m[1]) : 0;
      (byCh[ch] || (byCh[ch] = [])).push(key);
    });
    const ok = await confirmBox('Gỡ ' + keys.length + ' phiếu của bộ “' + slug + '”? Số phiếu ngoài web giảm ngay và không khôi phục được.', 'Gỡ phiếu');
    if (!ok) return;
    const typed = window.prompt('Gõ GỠ PHIẾU để xác nhận:', '');
    if (typed !== 'GỠ PHIẾU') { toast('Đã huỷ gỡ phiếu.', 'err'); return; }
    try {
      const groups = Object.keys(byCh);
      ensureQuota(groups.length * 2, 'gỡ phiếu');
      trackQuotaWrite(groups.length * 2, 'gỡ phiếu');
      const results = await Promise.all(groups.map((ch) => api.voteRemove(slug, Number(ch), byCh[ch])));
      const removed = results.reduce((sum, item) => sum + (Number(item && item.removed) || 0), 0);
      toast('Đã gỡ ' + removed + ' phiếu', 'ok');
    } catch (error) { toast('Gỡ phiếu lỗi: ' + (error.message || error), 'err'); throw error; }
  }

  async function resetVotes(body) {
    const target = body && body.slug ? ('bộ “' + body.slug + '”') : 'TẤT CẢ bộ';
    const what = body && body.ch ? ('phiếu chương ' + body.ch) : 'toàn bộ phiếu';
    const ok = await confirmBox('Reset ' + what + ' của ' + target + '? Lượt đọc giữ nguyên, phiếu về 0 và không hoàn tác được.', 'Reset phiếu');
    if (!ok) return;
    const typed = window.prompt('Gõ RESET để xác nhận:', '');
    if (typed !== 'RESET') { toast('Đã huỷ reset phiếu.', 'err'); return; }
    try {
      ensureQuota(2, 'reset phiếu');
      const res = await api.votesReset(body || {});
      trackQuotaWrite(2, 'reset phiếu');
      toast('Đã reset ' + (res.cleared || 0) + ' phiếu ở ' + (res.stories || 0) + ' bộ', 'ok');
      return res;
    } catch (error) { toast('Reset phiếu lỗi: ' + (error.message || error), 'err'); throw error; }
  }

  async function bulkUpdate(action, slugs) {
    if (!slugs.length) return;
    try {
      const registry = cloneRegistry(state.registry);
      const [kind, value] = String(action || '').split(':');
      registry.lib = (registry.lib || []).map((book) => {
        if (!slugs.includes(book.slug)) return book;
        if (kind === 'st') return Object.assign({}, book, { status: value });
        if (kind === 'pub') return Object.assign({}, book, { pubStatus: value });
        if (kind === '18') return Object.assign({}, book, { is18: value === '1' });
        return book;
      });
      await writeRegistry(registry, 'Đã áp dụng bulk action cho ' + slugs.length + ' bộ');
      setSelected({});
    } catch (error) { toast('Bulk action lỗi: ' + (error.message || error), 'err'); }
  }

  async function deleteBook(slug) {
    const book = ((state.registry && state.registry.lib) || []).find((item) => item.slug === slug);
    if (!book) return;
    const ok = await confirmBox('Xoá bộ “' + book.title + '” khỏi thư viện' + (state.online ? ' và xoá book trên KV' : ' trong phiên admin v2') + '?', 'Xoá');
    if (!ok) return;
    const typed = window.prompt('Gõ đúng slug để xác nhận xoá lần cuối:', '');
    if (typed !== slug) { toast('Đã huỷ xoá: slug xác nhận không khớp.', 'err'); return; }
    try {
      const registry = removeBookReferences(cloneRegistry(state.registry), slug);
      await deleteBookKv(slug).catch(() => null);
      await writeRegistry(registry, 'Đã xoá “' + book.title + '”');
      setSelected((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => key !== slug)));
      if (currentSlug === slug) { setCurrentSlug(''); setActiveTab('list'); }
    } catch (error) { toast('Xoá lỗi: ' + (error.message || error), 'err'); }
  }

  function handleTab(tab) {
    if (tab === 'edit' && !currentSlug) { toast('Chọn một bộ trong tab Thư viện trước đã.', 'info'); return; }
    setActiveTab(tab);
  }
  function editSlug(slug) { setCurrentSlug(slug); setActiveTab('edit'); loadBookForEdit(slug).catch(() => {}); }
  function handleSearch(q) { setListQuery(q || ''); setActiveTab('list'); }

  async function saveGenres(next, msg, extra) {
    const registry = cloneRegistry(state.registry);
    registry.settings = registry.settings || {};
    registry.settings.genres = next;
    if (extra && extra.remap) {
      (registry.lib || []).forEach((book) => {
        if (book && (book.genre === extra.remap.from || book.genre === extra.remap.from)) book.genre = extra.remap.to;
      });
    }
    await writeRegistry(registry, msg || 'Đã lưu thể loại');
  }

  async function saveHomepage(payload) {
    const registry = cloneRegistry(state.registry);
    registry.slides = payload.slides || [];
    registry.editorChoice = payload.editorChoice || [];
    registry.settings = registry.settings || {};
    registry.settings.editorChoice = payload.editorChoice || [];
    registry.settings.announcement = payload.announcement || { enabled: false, text: '', href: '' };
    if (payload.schedule) registry.schedule = Object.assign({}, registry.schedule || {}, payload.schedule);
    await writeRegistry(registry, 'Đã lưu trang chủ');
  }

  async function saveStaff(rows) {
    const registry = cloneRegistry(state.registry);
    registry.settings = registry.settings || {};
    registry.settings.staff = rows;
    await writeRegistry(registry, 'Đã lưu nhân sự');
  }
  function handleTodo(kind, book) {
    if (book && book.slug) return editSlug(book.slug);
    if (kind === 'cmts' || kind === 'reports') return setActiveTab(kind);
    setActiveTab(kind === 'new' ? 'new' : 'list');
  }

  useEffect(() => {
    if (currentSlug && bookCache[currentSlug] === undefined) loadBookForEdit(currentSlug).catch(() => {});
  }, [currentSlug, state.online]);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try { if (window.CZ_AUTH && window.CZ_AUTH.whenSettled) await window.CZ_AUTH.whenSettled(); } catch (e) {}
      if (cancelled) return;
      const current = loadSavedConnection();
      api.setConnection(current); store.setState({ apiBase: current.apiBase });
      if (current.apiBase && current.adminKey) { await connect(current.apiBase, current.adminKey, true); return; }
      const isAdmin = window.CZ_AUTH && window.CZ_AUTH.isAdmin && window.CZ_AUTH.isAdmin();
      if (isAdmin) await enterStatic('login', true);
    }
    boot(); return () => { cancelled = true; };
  }, []);

  const defaultConn = useMemo(() => loadSavedConnection(), [state.mode]);
  const authed = !!state.mode && !!state.registry;
  const writeBlocked = !!(state.online && state.quota && state.quota.writesToday >= (state.quota.limit || 1000));
  const currentTitle = ((((state.registry && state.registry.lib) || []).find((b) => b.slug === currentSlug) || {}).title) || currentSlug;
  if (!authed) return <AuthGate defaultApi={defaultConn.apiBase} defaultKey={defaultConn.adminKey} busy={busy} message={gateMessage} onConnect={connect} onStatic={() => enterStatic('local')} onLogin={login} />;

  let pane;
  if (activeTab === 'overview') pane = <Overview state={state} onReload={reload} onTodo={handleTodo} />;
  else if (activeTab === 'list') pane = <BookList registry={state.registry} selected={selected} onSelected={setSelected} onEdit={editSlug} onNew={() => setActiveTab('new')} onBulkUpdate={bulkUpdate} onDelete={deleteBook} apiBase={state.apiBase} initialQuery={listQuery} writeBlocked={writeBlocked} />;
  else if (activeTab === 'new') pane = <NewBook registry={state.registry} onCreate={createBook} onUploadImage={uploadImage} apiBase={state.apiBase} writeBlocked={writeBlocked} online={state.online} />;
  else if (activeTab === 'edit') pane = <BookEditor registry={state.registry} slug={currentSlug} bookData={bookCache[currentSlug]} bookLoading={bookLoading} apiBase={state.apiBase} onLoadBook={loadBookForEdit} onSave={saveMeta} onSaveBook={saveBookChapters} onUploadImage={uploadImage} onLock={setBookLock} onUnlock={unlockBook} onDuplicate={duplicateBook} onBack={() => setActiveTab('list')} onDelete={deleteBook} writeBlocked={writeBlocked} online={state.online} />;
  else if (activeTab === 'chapters') pane = <ChaptersHub registry={state.registry} apiBase={state.apiBase} onEdit={editSlug} />;
  else if (activeTab === 'genres') pane = <GenreManager registry={state.registry} onSave={saveGenres} />;
  else if (activeTab === 'homepage') pane = <HomepageCMS registry={state.registry} apiBase={state.apiBase} onSave={saveHomepage} writeBlocked={writeBlocked} online={state.online} />;
  else if (activeTab === 'users') pane = <UsersPanel registry={state.registry} onEdit={editSlug} onFilterAuthor={(name) => { setListQuery(name); setActiveTab('list'); }} />;
  else if (activeTab === 'roles') pane = <RolesPanel registry={state.registry} role={state.role} onSave={saveStaff} />;
  else if (activeTab === 'doctor') pane = <DoctorPanel state={state} onKvAudit={loadKvAudit} onScanBooks={scanBooks} onRecount={runRecount} onReload={reload} onFix={fixScanIssue} />;
  else if (activeTab === 'cmts') pane = <CommentsPanel state={state} onLoad={refreshComments} onDelete={deleteComment} />;
  else if (activeTab === 'reports') pane = <ReportsPanel state={state} onLoad={refreshReports} onMark={markReport} />;
  else if (activeTab === 'stats') pane = <StatsPanel state={state} onLoad={loadAdminStats} />;
  else if (activeTab === 'votes') pane = <VotesPanel state={state} onLoadVoters={loadVoters} onRemoveVotes={removeVotes} onResetVotes={resetVotes} />;
  else if (activeTab === 'log') pane = <LogPanel state={state} onLoad={loadAdminLog} />;
  else if (activeTab === 'settings') pane = <SettingsPanel state={state} onReload={reload} onRecount={runRecount} onStatsRefresh={runStatsRefresh} onImportBlogger={importBloggerChapter} onSyncBlogger={syncFromBlogger} onDownloadBackup={downloadBackup} onRestoreBackup={restoreBackup} />;
  else pane = <PlaceholderTab tab={activeTab} />;

  return (
    <Layout state={state} activeTab={activeTab} currentSlug={currentSlug} currentTitle={currentTitle} onTab={handleTab} onDisconnect={disconnect} onSearch={handleSearch}>
      {notice ? <div class="msgbar show info v2notice">{notice}</div> : null}
      {state.error ? <div class="msgbar show err v2notice">{state.error}</div> : null}
      {state.partialError ? (
        <div class="v2partial" role="alert">
          <span>Book đã ghi nhưng registry thất bại: {state.partialError}. Không báo lưu hoàn tất.</span>
          <button class="btn pri sm" type="button" onClick={retryPendingRegistry}>Thử lại registry</button>
        </div>
      ) : null}
      {pane}
    </Layout>
  );
}

function mount() {
  const root = document.getElementById('adminV2Root');
  if (root) render(<App />, root);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
else mount();
