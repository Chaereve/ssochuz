import { h } from 'preact';
import { useState } from 'preact/hooks';

function authDiagnose() {
  try { return window.CZ_AUTH && window.CZ_AUTH.diagnose ? window.CZ_AUTH.diagnose() : null; }
  catch (e) { return null; }
}

function iconHtml(name) {
  return window.CZ && window.CZ.icon ? window.CZ.icon(name, 'i-s') : '';
}

export function AuthGate({ defaultApi = '', defaultKey = '', busy = false, message = '', onConnect, onStatic, onLogin }) {
  const [apiBase, setApiBase] = useState(defaultApi || '');
  const [adminKey, setAdminKey] = useState(defaultKey || '');
  const [showKey, setShowKey] = useState(false);
  const diag = authDiagnose();
  const provider = diag && diag.provider ? diag.provider : (window.CZ_AUTH_PROVIDER || 'supabase');

  const submit = (event) => {
    event.preventDefault();
    if (onConnect) onConnect(apiBase, adminKey);
  };

  return (
    <main class="v2gate" aria-label="Cổng quản trị">
      <div class="gate v2gate-card">
        <div class="v2gate-brand">
          <span class="v2gate-logo"><span class="dot" aria-hidden="true"></span>ssochuz<i>admin</i></span>
        </div>
        <h1>Đăng nhập quản trị</h1>
        <p class="gsub">
          Một trang quản trị duy nhất cho thư viện, soạn chương, bình luận, báo lỗi,
          homepage và vai trò.
        </p>

        <div class="v2gate-actions">
          <button class="btn pri v2gate-primary" type="button" disabled={busy} onClick={onLogin}>
            <span dangerouslySetInnerHTML={{ __html: iconHtml('user') }} />
            <span>{busy ? 'Đang xử lý…' : 'Đăng nhập bằng Google / Supabase'}</span>
          </button>
          <button class="btn ghost v2gate-secondary" type="button" disabled={busy} onClick={onStatic}>
            <span dangerouslySetInnerHTML={{ __html: iconHtml('book') }} />
            <span>Xem dữ liệu tĩnh trong repo</span>
          </button>
        </div>
        <p class="hint v2gate-provider">
          Nhà cung cấp đăng nhập: <code>{provider || 'chưa cấu hình'}</code>. Danh sách email quản trị chỉ nằm trên Worker.
        </p>

        <div class="v2gate-sep"><span>hoặc nối Worker bằng ADMIN_KEY</span></div>

        <form class="v2connect" onSubmit={submit} autocomplete="off">
          <div class="v2field">
            <label class="fl" for="v2Api">URL Worker</label>
            <input class="inp" id="v2Api" type="url" inputmode="url" value={apiBase}
              onInput={(e) => setApiBase(e.currentTarget.value)}
              placeholder="https://chuseoz-cms.xxx.workers.dev" autocomplete="off" spellcheck={false} />
          </div>
          <div class="v2field">
            <label class="fl" for="v2Key">ADMIN_KEY</label>
            <div class="v2keywrap">
              <input class="inp" id="v2Key" type={showKey ? 'text' : 'password'} value={adminKey}
                onInput={(e) => setAdminKey(e.currentTarget.value)}
                placeholder="khoá quản trị" autocomplete="off" spellcheck={false} />
              <button class="v2keytoggle" type="button" aria-pressed={showKey}
                aria-label={showKey ? 'Ẩn ADMIN_KEY' : 'Hiện ADMIN_KEY'} title={showKey ? 'Ẩn khoá' : 'Hiện khoá'}
                onClick={() => setShowKey(!showKey)}>
                <span dangerouslySetInnerHTML={{ __html: iconHtml(showKey ? 'eye' : 'lock') }} />
              </button>
            </div>
            <p class="hint">Khoá chỉ lưu trong <code>sessionStorage</code>; đóng tab là mất.</p>
          </div>
          <button class="btn pri v2connect-submit" type="submit" disabled={busy}>
            {busy ? 'Đang kiểm tra…' : 'Kiểm tra & kết nối'}
          </button>
        </form>
        {message ? <div class="msgbar show err" role="alert">{message}</div> : null}
      </div>
    </main>
  );
}
