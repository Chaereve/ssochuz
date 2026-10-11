import { h } from 'preact';
import { useState } from 'preact/hooks';

function authDiagnose() {
  try { return window.CZ_AUTH && window.CZ_AUTH.diagnose ? window.CZ_AUTH.diagnose() : null; }
  catch (e) { return null; }
}

const FEATURES = [
  ['Thư viện', 'Lọc, sửa và xuất bản bộ truyện hàng loạt'],
  ['Soạn chương', 'Trình soạn thảo, nháp tự lưu, nhập .txt/.docx'],
  ['Kiểm duyệt', 'Bình luận, báo lỗi và phiếu bầu'],
];

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
    <main class="v2gate" aria-label="Đăng nhập quản trị">
      <section class="v2gate-brand" aria-hidden="false">
        <a class="logo v2gate-logo" href="/"><span class="dot"></span>ssochuz<i>admin</i></a>
        <div class="v2gate-copy">
          <h2>Quản lý thư viện<br />từ một chỗ.</h2>
          <p>Mọi thao tác ghi đều cần đăng nhập và được lưu vào Cloudflare KV.</p>
        </div>
        <ul class="v2gate-list">
          {FEATURES.map(([t, d]) => (
            <li key={t}><b>{t}</b><span>{d}</span></li>
          ))}
        </ul>
      </section>

      <div class="v2gate-panel">
        <div class="gate v2gate-card">
          <h1>Đăng nhập</h1>
          <p class="gsub">Dùng tài khoản quản trị để tiếp tục.</p>

          <div class="v2gate-actions">
            <button class="btn pri v2gate-primary" type="button" disabled={busy} onClick={onLogin}>
              Đăng nhập với {provider === 'google' ? 'Google' : 'Supabase'}
            </button>
            <button class="btn ghost" type="button" disabled={busy} onClick={onStatic}>
              Xem dữ liệu tĩnh (chỉ đọc)
            </button>
          </div>

          <div class="sep">hoặc kết nối bằng ADMIN_KEY</div>

          <form class="v2connect" onSubmit={submit}>
            <div class="v2field">
              <label class="fl" for="v2Api">URL Worker</label>
              <input class="inp" id="v2Api" value={apiBase} onInput={(e) => setApiBase(e.currentTarget.value)} placeholder="https://ten-worker.workers.dev" autocomplete="off" spellCheck={false} />
            </div>
            <div class="v2field">
              <label class="fl" for="v2Key">ADMIN_KEY</label>
              <input class="inp" id="v2Key" value={adminKey} onInput={(e) => setAdminKey(e.currentTarget.value)} type="password" placeholder="Khoá quản trị" autocomplete="off" />
              <p class="hint">Chỉ lưu trong phiên trình duyệt; đóng tab là mất.</p>
            </div>
            <button class="btn pri" type="submit" disabled={busy}>{busy ? 'Đang kiểm tra…' : 'Kết nối'}</button>
          </form>

          {message ? <div class="msgbar show err" role="alert">{message}</div> : null}
        </div>
      </div>
    </main>
  );
}
