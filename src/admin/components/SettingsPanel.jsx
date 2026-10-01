import { h } from 'preact';
import { useState } from 'preact/hooks';

function num(value) { return Number(value || 0).toLocaleString('vi-VN'); }

/* Cài đặt & thao tác hệ thống.
   Bốn nhóm việc tách bạch, mỗi nhóm là một mục có tựa và mô tả ngắn; nhóm nào chỉ
   để đọc thì không có nút ghi. Mọi nhãn nút giữ nguyên như bản cũ vì có bài kiểm
   thử bám theo chữ trên nút. */
export function SettingsPanel({ state, onReload, onRecount, onStatsRefresh, onImportBlogger, onSyncBlogger, onDownloadBackup, onRestoreBackup }) {
  const writeBlocked = !!(state.online && state.quota && state.quota.writesToday >= (state.quota.limit || 1000));
  const lib = (state.registry && state.registry.lib) || [];
  const [slug, setSlug] = useState((lib[0] && lib[0].slug) || '');
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState('append');
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState('');
  const run = async (name, fn) => {
    setBusy(name); setResult('');
    try {
      const res = await fn();
      if (res) setResult(JSON.stringify(res, null, 2));
    } catch (e) { setResult('Lỗi: ' + (e.message || e)); }
    finally { setBusy(''); }
  };
  const overflow = (state.worker && state.worker.overflow) || {};
  return <div id="pane-settings" class="v2pane"><section class="card2">
    <h3>Cài đặt &amp; thao tác hệ thống</h3>
    <p class="hint">Admin giữ static Cloudflare Pages, không thêm dịch vụ trả phí và không đưa secret vào bundle. Các nút ghi KV đều đi qua endpoint Worker có sẵn.</p>

    <div class="v2fsec" aria-label="Kết nối và hạn mức">
      <div class="v2fsec-head"><b>Kết nối &amp; hạn mức</b><span class="hint">Chỉ để đọc — số liệu lấy từ Worker và bộ đếm quota của phiên.</span></div>
      <div class="v2ops-grid">
        <div class="v2mini"><b>Kết nối</b><p class="hint">Chế độ: {state.online ? 'Worker + ADMIN_KEY' : 'dữ liệu tĩnh/login frontend'}</p><p class="hint">API: <code>{state.apiBase || (window.CZ && window.CZ.API) || '—'}</code></p></div>
        <div class="v2mini"><b>Quota ghi KV</b><p class="hint">Counter hiện tại: {num(state.quota && state.quota.writesToday)}/{num((state.quota && state.quota.limit) || 1000)} · nguồn {state.quota && state.quota.source}</p></div>
      </div>
    </div>

    <div class="v2fsec" aria-label="Sao lưu và khôi phục">
      <div class="v2fsec-head"><b>Sao lưu &amp; khôi phục</b><span class="hint">Backup một file JSON cho cả registry lẫn book; khôi phục thì ghi đè lên KV.</span></div>
      <div class="v2toolbar">
        <button class="btn ghost" type="button" disabled={!!busy} onClick={() => run('backup', onDownloadBackup)}>Tải backup JSON</button>
        <label class="btn filepick">Chọn tệp backup JSON
          <input type="file" aria-label="Chọn file backup JSON để khôi phục" accept=".json,application/json" onChange={(e) => { const f = e.currentTarget.files && e.currentTarget.files[0]; if (f && onRestoreBackup) onRestoreBackup(f).catch((er) => setResult('Lỗi: ' + (er.message || er))); e.currentTarget.value = ''; }} />
        </label>
      </div>
      <p class="hint">Tệp backup mặc định đã bỏ lock hash để an toàn khi đưa vào repo. Khôi phục hỏi xác nhận mạnh và tính quota từng lượt ghi.</p>
    </div>

    <div class="v2fsec" aria-label="Nhập và đồng bộ Blogger">
      <div class="v2fsec-head"><b>Nhập &amp; đồng bộ Blogger</b><span class="hint">Nhập chương mới hoặc đồng bộ metadata từ blogspot; số chương thật trong KV vẫn là nguồn thắng.</span></div>
      <div class="v2ops-grid">
        <div class="v2mini">
          <b>Nhập chương từ Blogger</b>
          <p class="hint">Tự tìm bài khớp tên truyện, hoặc dán link blogspot cụ thể. Ghi book + registry, không đổi schema.</p>
          <label class="fl">Bộ truyện</label><select class="inp" aria-label="Bộ truyện nhận chương" value={slug} onChange={(e) => setSlug(e.currentTarget.value)}>{lib.map((book) => <option value={book.slug}>{book.title}</option>)}</select>
          <label class="fl">URL bài viết Blogspot (không bắt buộc)</label><input class="inp" aria-label="URL bài viết Blogspot" value={url} onInput={(e) => setUrl(e.currentTarget.value)} placeholder="https://chuseoz.blogspot.com/..." />
          <label class="fl">Cách nhập</label><select class="inp" aria-label="Cách nhập chương từ Blogger" value={mode} onChange={(e) => setMode(e.currentTarget.value)}><option value="append">Thêm vào cuối</option><option value="replace-last">Thay chương cuối</option></select>
          <button class="btn pri sm" type="button" disabled={!state.online || writeBlocked || !!busy || !slug} onClick={() => run('import', () => onImportBlogger({ slug, url, mode }))}>{busy === 'import' ? 'Đang nhập…' : 'Nhập chương'}</button>
        </div>
        <div class="v2mini">
          <b>Đồng bộ metadata Blogger</b>
          <p class="hint">Đọc list-novel + lịch ra chương rồi cập nhật registry KV.</p>
          <button class="btn ghost sm" type="button" disabled={!state.online || writeBlocked || !!busy} onClick={() => run('sync', onSyncBlogger)}>{busy === 'sync' ? 'Đang đồng bộ…' : 'Đồng bộ Blogger'}</button>
        </div>
      </div>
    </div>

    <div class="v2fsec" aria-label="Overflow KV và bảo trì">
      <div class="v2fsec-head"><b>Overflow KV &amp; bảo trì</b><span class="hint">Chỗ chứa bản đầy đủ của book/ảnh khi KV gần đầy, và hai việc đếm lại dữ liệu.</span></div>
      <div class="v2mini v2overflow-card">
        <b>Overflow KV (free)</b>
        <p class="hint">Supabase: {overflow.supabase ? 'connected' : 'unavailable'}. R2: {overflow.r2 ? 'connected' : 'unavailable'}. Bìa: {overflow.covers ? 'Supabase Storage (bucket covers, 1 GB free — không unlimited)' : 'KV (chưa gắn SUPABASE_SERVICE_ROLE)'}. Ảnh chương: {(overflow.supabase || overflow.r2) ? 'overflow sang Supabase/R2 (bảng ssochuz_blobs)' : 'KV'}.</p>
        <p class="hint">“connected” nghĩa là Worker ĐÃ GẮN secret (SUPABASE_URL + SUPABASE_SERVICE_ROLE) — chưa chắc bảng đã có. Chưa chạy SQL dưới đây thì mọi ghi overflow sẽ lỗi và bản đầy đủ TỰ RỚT VỀ KV (fallback) — không mất dữ liệu, chỉ chưa đỡ được KV.</p>
        <p class="hint">Chưa gắn thì book/img vẫn nằm full trong KV. Secret <code>SUPABASE_SERVICE_ROLE</code> chỉ đặt trên Worker, không vào bundle.</p>
        <p class="hint">SQL một lần (Supabase SQL Editor, bảng ~500 MB free):</p>
        <pre class="v2result">{'create table if not exists public.ssochuz_blobs (\n  key text primary key,\n  value text not null,\n  mime text,\n  updated_at timestamptz default now()\n);\nalter table public.ssochuz_blobs enable row level security;'}</pre>
        <p class="hint">R2 10 GB free (tuỳ chọn): tạo bucket rồi binding <code>CZ_R2</code> trong wrangler.toml (đã ghi chú sẵn). Ghi xong KV chỉ còn “stub” nhỏ, bản đầy đủ nằm ở Supabase/R2.</p>
      </div>
      <div class="v2toolbar">
        <button class="btn ghost" type="button" onClick={onReload}>Đọc lại dữ liệu</button>
        <button class="btn ghost" type="button" disabled={!state.online || writeBlocked || !!busy} onClick={() => run('stats', onStatsRefresh)}>Flush stats cache</button>
        <button class="btn pri" type="button" disabled={!state.online || writeBlocked || !!busy} onClick={() => run('recount', onRecount)}>Đếm lại số chương</button>
      </div>
      <p class="hint">Đếm lại số chương và flush cache đều là thao tác ghi, tính vào quota KV hôm nay.</p>
    </div>
    {result ? <pre class="v2result">{result}</pre> : null}
  </section></div>;
}
