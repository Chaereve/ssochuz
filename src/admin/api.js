const API_KEY_STORAGE = 'cz_kv_api';
const ADMIN_KEY_STORAGE = 'cz_kv_key';

export function normalizeApi(input) {
  let value = String(input == null ? '' : input).trim().replace(/\/+$/, '');
  if (value && !/^https?:\/\//i.test(value)) value = 'https://' + value;
  return value;
}

export function loadSavedConnection() {
  let apiBase = '';
  let adminKey = '';
  try { apiBase = localStorage.getItem(API_KEY_STORAGE) || ''; } catch (e) {}
  try {
    localStorage.removeItem(ADMIN_KEY_STORAGE);
    adminKey = sessionStorage.getItem(ADMIN_KEY_STORAGE) || '';
  } catch (e) {}
  if (!apiBase && window.CZ && window.CZ.API) apiBase = window.CZ.API;
  return { apiBase: normalizeApi(apiBase), adminKey };
}

export function saveConnection(apiBase, adminKey) {
  try { localStorage.setItem(API_KEY_STORAGE, normalizeApi(apiBase)); } catch (e) {}
  try {
    localStorage.removeItem(ADMIN_KEY_STORAGE);
    if (adminKey) sessionStorage.setItem(ADMIN_KEY_STORAGE, adminKey);
  } catch (e) {}
}

export function clearConnection() {
  try { sessionStorage.removeItem(ADMIN_KEY_STORAGE); } catch (e) {}
  try { localStorage.removeItem(ADMIN_KEY_STORAGE); } catch (e) {}
}

export class AdminApi {
  constructor({ apiBase = '', adminKey = '' } = {}) {
    this.apiBase = normalizeApi(apiBase);
    this.adminKey = adminKey || '';
  }

  setConnection({ apiBase, adminKey }) {
    if (apiBase !== undefined) this.apiBase = normalizeApi(apiBase);
    if (adminKey !== undefined) this.adminKey = String(adminKey || '');
  }

  async request(path, options = {}) {
    const base = normalizeApi(options.apiBase || this.apiBase || '');
    if (!base) throw new Error('Chưa nối Worker — nhập URL Worker hoặc dùng dữ liệu tĩnh.');
    const headers = Object.assign({}, options.headers || {});
    const hasBody = options.body !== undefined && options.body !== null;
    if (hasBody && !(options.body instanceof FormData)) headers['content-type'] = headers['content-type'] || 'application/json';
    if (options.auth !== false && this.adminKey) headers['x-admin-key'] = this.adminKey;
    if (options.importMode) headers['x-import-mode'] = options.importMode;

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), options.timeout || 12000) : null;
    try {
      const response = await fetch(base + path, {
        method: options.method || 'GET',
        headers,
        cache: 'no-store',
        mode: 'cors',
        signal: controller ? controller.signal : undefined,
        body: hasBody
          ? (headers['content-type'] === 'application/json' ? JSON.stringify(options.body) : options.body)
          : undefined,
      });
      const contentType = response.headers && response.headers.get ? response.headers.get('content-type') || '' : '';
      const data = contentType.includes('application/json')
        ? await response.json().catch(() => ({}))
        : await response.text().catch(() => '');
      if (!response.ok || (data && data.ok === false)) {
        const error = new Error((data && data.error) || `HTTP ${response.status}`);
        error.httpStatus = response.status;
        error.payload = data;
        throw error;
      }
      return data;
    } catch (error) {
      const msg = String((error && error.message) || error || '');
      if (error && error.name === 'AbortError') {
        throw new Error(`Hết thời gian chờ Worker (12 giây) tại ${base}. Mở ${base}/api/health để kiểm tra.`);
      }
      if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
        throw new Error(`Failed to fetch — không nối được Worker tại ${base}. Có thể do CORS, URL sai hoặc Worker chưa deploy.`);
      }
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  health() { return this.request('/api/health', { auth: false }); }
  whoami() { return this.request('/api/whoami'); }
  /* VÁ (23/09): admin PHẢI đọc registry kèm ADMIN_KEY để nhận bản ĐẦY ĐỦ
     (kể cả nháp/chờ duyệt/hẹn giờ/lưu trữ). Bản cũ dùng auth:false nên chỉ nhận
     bản public đã lọc — rồi mọi lần lưu PUT cả bản lọc đó đè lên KV, sách
     non-public mất dần khỏi kho, trang tác giả/couple báo “Chưa tải được
     dữ liệu”. Chế độ tĩnh không gọi hàm này (dùng staticRegistry). */
  registry() { return this.request('/api/registry'); }
  kvStats() { return this.request('/api/admin/kv'); }
  adminReports(query = '') { return this.request('/api/admin/reports' + (query ? '?q=' + encodeURIComponent(query) : '')); }
  patchReport(id, done) { return this.request('/api/admin/reports', { method: 'PATCH', body: { id, done: !!done } }); }
  adminComments(limit = 800, slug = '') { return this.request('/api/admin/comments?limit=' + encodeURIComponent(limit) + (slug ? '&slug=' + encodeURIComponent(slug) : '')); }
  adminStats() { return this.request('/api/admin/stats'); }
  adminLog() { return this.request('/api/admin/log'); }
  adminVoters(slug) { return this.request('/api/admin/voters?slug=' + encodeURIComponent(slug)); }
  book(slug) { return this.request('/api/book/' + encodeURIComponent(slug)); }
  putRegistry(registry) { return this.request('/api/registry', { method: 'PUT', body: registry }); }
  putBook(slug, book) { return this.request('/api/book/' + encodeURIComponent(slug), { method: 'PUT', body: book }); }
  /* sửa MỘT chương (nút “Lưu chương”): chỉ gửi 1 chương thay vì cả bộ —
     nhanh hơn hẳn với bộ dài, và Worker tự cập nhật số chương trong registry */
  putChapter(slug, body) { return this.request('/api/book/' + encodeURIComponent(slug) + '/chapter', { method: 'PUT', body }); }
  saveChapter(slug, index, chapter) { return this.putChapter(slug, { index, chapter }); }
  deleteChapter(slug, index) { return this.putChapter(slug, { index, remove: true }); }
  moveChapter(slug, from, to) { return this.putChapter(slug, { from, to }); }
  deleteBook(slug) { return this.request('/api/book/' + encodeURIComponent(slug), { method: 'DELETE' }); }
  deleteComment(slug, id) { return this.request('/api/comments/' + encodeURIComponent(slug) + '/' + encodeURIComponent(id), { method: 'DELETE' }); }
  /* `id` là mã băm NỘI DUNG ảnh do trình duyệt tính (xem utils/images.js): Worker
     thấy id đã có trong kho thì trả URL cũ, không ghi thêm bản sao — chỗ tiết
     kiệm dung lượng nhiều nhất khi dán lại cùng một tấm ảnh. */
  postImage(image) { return this.request('/api/img', { method: 'POST', body: { data: image.data, type: image.type, kind: image.kind || '', id: image.id || '' } }); }
  lockSet(slug, password) { return this.request('/api/lock/set', { method: 'POST', body: { slug, password } }); }
  recount() { return this.request('/api/recount', { method: 'POST' }); }
  /* chuyển book/ảnh cũ trong KV sang overflow (Supabase/R2) — Worker xử theo lô,
     gọi lặp tới khi done:true. body: {limit?, only?: 'books'|'covers'|'images'} */
  migrateOverflow(body = {}) { return this.request('/api/admin/migrate-overflow', { method: 'POST', body, timeout: 29000 }); }
  importPost(slug, url = '', importMode = 'append') { return this.request('/api/import', { method: 'POST', body: { slug, url }, importMode }); }
  syncBlogger() { return this.request('/api/sync', { method: 'POST' }); }
  voteRemove(slug, ch, keys) { return this.request('/api/admin/vote-remove', { method: 'POST', body: { slug, ch, keys } }); }
  votesReset(body) { return this.request('/api/admin/votes/reset', { method: 'POST', body }); }
  statsRefresh() { return this.request('/api/stats/refresh', { method: 'POST' }); }
}


export async function staticRegistry() {
  const response = await fetch('/data/registry.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Không đọc được /data/registry.json');
  return response.json();
}
