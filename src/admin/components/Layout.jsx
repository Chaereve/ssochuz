import { h } from 'preact';
import { pct } from '../utils/format.js';

const TABS = [
  ['overview', 'Tổng quan', 'chart'],
  ['list', 'Thư viện', 'book'],
  ['new', 'Thêm bộ', 'plus'],
  ['edit', 'Sửa bộ', 'edit'],
  ['doctor', 'Kiểm tra dữ liệu', 'pulse'],
  ['cmts', 'Bình luận', 'comment'],
  ['reports', 'Báo lỗi', 'alert'],
  ['stats', 'Thống kê', 'chart'],
  ['votes', 'Phiếu bầu', 'heart'],
  ['log', 'Nhật ký', 'history'],
  ['settings', 'Cài đặt', 'gear'],
];

function Icon({ name }) {
  const html = window.CZ && window.CZ.icon ? window.CZ.icon(name, 'i-s') : '';
  return <span class="admin-nav-icon" dangerouslySetInnerHTML={{ __html: html }} />;
}

function quotaLevel(quota) {
  const used = Number(quota && quota.writesToday) || 0;
  if (used >= (quota && quota.criticalThreshold || 950)) return 'critical';
  if (used >= (quota && quota.warningThreshold || 800)) return 'warning';
  return 'ok';
}

const IMPLEMENTED = new Set(['overview', 'list', 'new', 'edit', 'doctor', 'cmts', 'reports', 'stats', 'votes', 'log', 'settings']);

export function Layout({ state, activeTab, currentSlug = '', onTab, onDisconnect, children }) {
  const quota = state.quota || {};
  const used = Number(quota.writesToday) || 0;
  const limit = Number(quota.limit) || 1000;
  const qLevel = quotaLevel(quota);
  const role = state.role || (state.mode === 'local' ? 'local' : state.mode === 'login' ? 'admin' : '—');
  return (
    <div class="v2app">
      <header class="abar v2top"><div class="in">
        <div class="admin-bar-brand">
          <a class="logo" href="/" title="ssochuz library"><span class="dot"></span>ssochuz<i> library</i></a>
          <span class="pill acc">admin v2</span>
        </div>
        <div class="admin-bar-state" aria-live="polite">
          <span class={`chip ${state.online ? 'ok' : 'warn'}`}><b>{state.online ? 'Cloudflare KV' : 'dữ liệu tĩnh'}</b></span>
          <span class="chip"><b>role</b>&nbsp;{role}</span>
          <span class={`v2quota ${qLevel}`} title={quota.supported ? 'Số ghi KV hôm nay từ Worker' : 'Worker hiện chưa trả writesToday; đang hiển thị counter ước tính phía client'}>
            <span>KV write</span><b>{used}/{limit}</b><i style={{ width: `${pct(used, limit)}%` }}></i>
          </span>
          <button class="btn ghost sm" type="button" onClick={onDisconnect}>{state.online ? 'Ngắt kết nối' : 'Đóng phiên'}</button>
        </div>
      </div></header>

      <div class="ashell authed v2shell">
        <aside class="aside v2aside" aria-label="Điều hướng quản trị v2">
          <div class="side-title">Admin v2</div>
          <nav id="tabs" class="admin-nav">
            {TABS.map(([id, label, icon]) => {
              const enabled = IMPLEMENTED.has(id) && (id !== 'edit' || currentSlug);
              return (
                <button type="button" class={(activeTab === id ? 'on' : '') + (!enabled ? ' muted' : '')} aria-current={activeTab === id ? 'page' : 'false'} data-tab={id} onClick={() => onTab(id)} disabled={id === 'edit' && !currentSlug}>
                  <Icon name={icon} /><span>{label}</span>{!IMPLEMENTED.has(id) ? <span class="ct">soon</span> : id === 'edit' && currentSlug ? <span class="ct">đang sửa</span> : null}
                </button>
              );
            })}
          </nav>
          <p class="hint v2side-note">Admin v2 chạy song song bản cũ. Tab ghi dữ liệu luôn báo quota và hỏi xác nhận mạnh.</p>
        </aside>
        <main class="smain v2main">
          <nav class="crumb"><a href="/">Trang chủ</a><span>›</span><a href="/admin.html">Admin cũ</a><span>›</span><b>Admin v2</b></nav>
          <div class="phead slim">
            <h1>Trang quản trị v2</h1>
            <p class="sm">Kiến trúc module hoá · chạy song song bản cũ · chỉ ghi production khi nối Worker bằng ADMIN_KEY.</p>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
