import { h } from 'preact';
import { useState } from 'preact/hooks';

function authDiagnose() {
  try { return window.CZ_AUTH && window.CZ_AUTH.diagnose ? window.CZ_AUTH.diagnose() : null; }
  catch (e) { return null; }
}

export function AuthGate({ defaultApi = '', defaultKey = '', busy = false, message = '', onConnect, onStatic, onLogin }) {
  const [apiBase, setApiBase] = useState(defaultApi || '');
  const [adminKey, setAdminKey] = useState(defaultKey || '');
  const diag = authDiagnose();
  const provider = diag && diag.provider ? diag.provider : (window.CZ_AUTH_PROVIDER || 'supabase');

  const submit = (event) => {
    event.preventDefault();
    if (onConnect) onConnect(apiBase, adminKey);
  };

  return (
    <section class="v2gate" aria-label="Cổng quản trị">
      <div class="gate v2gate-card">
        <span class="pill acc">admin</span>
        <h1>Trang quản trị ssochuz library</h1>
        <p class="gsub">
          Một trang quản trị duy nhất tại /admin — thư viện, soạn chương, bình luận,
          báo lỗi, homepage CMS, vai trò và cài đặt. Bản cũ đã gộp xong, không còn admin riêng.
        </p>
        <div class="v2gate-actions">
          <button class="btn pri" type="button" disabled={busy} onClick={onLogin}>Đăng nhập bằng Google / Supabase</button>
          <button class="btn ghost" type="button" disabled={busy} onClick={onStatic}>Xem dữ liệu tĩnh trong repo</button>
        </div>
        <p class="hint">Nhà cung cấp đăng nhập hiện tại: <code>{provider || 'chưa cấu hình'}</code>. Danh sách email quản trị vẫn chỉ nằm trên Worker.</p>
        <div class="sep">hoặc dùng ADMIN_KEY để nối KV</div>
        <form class="v2connect" onSubmit={submit}>
          <div>
            <label class="fl" for="v2Api">URL Worker</label>
            <input class="inp" id="v2Api" value={apiBase} onInput={(e) => setApiBase(e.currentTarget.value)} placeholder="https://chuseoz-cms.xxx.workers.dev" autocomplete="off" />
          </div>
          <div>
            <label class="fl" for="v2Key">ADMIN_KEY</label>
            <input class="inp" id="v2Key" value={adminKey} onInput={(e) => setAdminKey(e.currentTarget.value)} type="password" placeholder="khoá quản trị" autocomplete="off" />
            <p class="hint">Khoá chỉ lưu trong <code>sessionStorage</code>; đóng tab là mất.</p>
          </div>
          <button class="btn pri" type="submit" disabled={busy}>{busy ? 'Đang kiểm tra…' : 'Kiểm tra & kết nối'}</button>
        </form>
        {message ? <div class="msgbar show err">{message}</div> : null}
      </div>
    </section>
  );
}
