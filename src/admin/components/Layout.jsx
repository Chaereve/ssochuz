import { h } from 'preact';
import { useState } from 'preact/hooks';
import { pct } from '../utils/format.js';

const TABS = [
  ['overview', 'Tổng quan', 'chart', 'Quản lý'],
  ['list', 'Thư viện', 'library', ''],
  ['new', 'Thêm bộ', 'plus', ''],
  ['edit', 'Sửa bộ', 'edit', ''],
  ['doctor', 'Kiểm tra dữ liệu', 'pulse', 'Vận hành'],
  ['cmts', 'Bình luận', 'chat', ''],
  ['reports', 'Báo lỗi', 'alert', ''],
  ['stats', 'Thống kê', 'chart', ''],
  ['votes', 'Phiếu bầu', 'heart', ''],
  ['log', 'Nhật ký', 'history', ''],
  ['settings', 'Cài đặt', 'gear', ''],
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

function ThemeButton() {
  const [dark, setDark] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark');
  const toggle = () => {
    let next = dark ? 'light' : 'dark';
    if (window.CZ && window.CZ.themeToggle) next = window.CZ.themeToggle() || next;
    else {
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('ssochuz-theme', next); } catch (e) {}
    }
    setDark(next === 'dark');
  };
  const html = window.CZ && window.CZ.icon ? window.CZ.icon(dark ? 'sun' : 'moon', 'i-s') : '';
  return (
    <button class="hbtn admin-tool" type="button" onClick={toggle} title="Đổi nền sáng/tối" aria-label="Đổi nền sáng/tối">
      <span dangerouslySetInnerHTML={{ __html: html }} />
    </button>
  );
}

export function Layout({ state, activeTab, currentSlug = '', onTab, onDisconnect, children }) {
  const quota = state.quota || {};
  const used = Number(quota.writesToday) || 0;
  const limit = Number(quota.limit) || 1000;
  const qLevel = quotaLevel(quota);
  const role = state.role || (state.mode === 'local' ? 'local' : state.mode === 'login' ? 'admin' : '—');
  return (
    <div class="v2app">
      <header class="abar"><div class="in">
        <div class="admin-bar-brand">
          <a class="logo" href="/" title="ssochuz library"><span class="dot"></span>ssochuz<i> library</i></a>
          <span class="pill acc">quản trị v2</span>
        </div>
        <div class="admin-bar-state" aria-live="polite">
          <span class={`chip ${state.online ? 'ok' : 'warn'}`}><span class="d"></span><b>{state.online ? 'Cloudflare KV' : 'dữ liệu tĩnh'}</b></span>
          <span class="chip"><span class="d"></span><span>role</span><b>&nbsp;{role}</b></span>
          <span class={`v2quota ${qLevel}`} title={quota.supported ? 'Số ghi KV hôm nay từ Worker' : 'Worker hiện chưa trả writesToday; đang hiển thị counter ước tính phía client'}>
            <span>KV write</span><b>{used}/{limit}</b><i style={{ width: `${pct(used, limit)}%` }}></i>
          </span>
          <button class="btn ghost sm" type="button" onClick={onDisconnect}>{state.online ? 'Ngắt kết nối' : 'Đóng phiên'}</button>
        </div>
        <span class="grow"></span>
        <div class="admin-bar-tools" aria-label="Công cụ trang quản trị">
          <a class="hbtn admin-tool" href="/" target="_blank" rel="noopener" title="Mở trang web" aria-label="Mở trang web"><span dangerouslySetInnerHTML={{ __html: window.CZ && window.CZ.icon ? window.CZ.icon('right', 'i-s') : '' }} /><span class="admin-tool-label">Web</span></a>
          <ThemeButton />
        </div>
      </div></header>

      <main class="amain">
        <div class="ashell authed v2shell">
          <nav class="snav v2aside" id="tabs" aria-label="Điều hướng quản trị v2">
            {TABS.map(([id, label, icon, group]) => {
              const enabled = IMPLEMENTED.has(id) && (id !== 'edit' || currentSlug);
              const groupLabel = group ? <span class="admin-nav-label">{group}</span> : null;
              const out = (
                <button type="button" class={(activeTab === id ? 'on' : '') + (!enabled ? ' muted' : '')} aria-current={activeTab === id ? 'page' : 'false'} data-tab={id} onClick={() => onTab(id)} disabled={id === 'edit' && !currentSlug}>
                  <Icon name={icon} /><span>{label}</span>{!IMPLEMENTED.has(id) ? <span class="ct">soon</span> : id === 'edit' && currentSlug ? <span class="ct">đang sửa</span> : null}
                </button>
              );
              return group ? [groupLabel, out] : out;
            })}
            <p class="hint v2side-note">Admin v2 đang thay `/admin`; bản cũ giữ ở `/admin-legacy` để rollback. Tab ghi dữ liệu luôn báo quota và hỏi xác nhận mạnh.</p>
          </nav>
          <main class="smain v2main">
            <nav class="crumb"><a href="/">Trang chủ</a><span>›</span><a href="/admin-legacy">Admin cũ</a><span>›</span><b>Admin v2</b></nav>
            <div class="phead slim">
              <h1>Trang quản trị v2</h1>
              <p class="sm">Kiến trúc module hoá · cutover vào /admin · chỉ ghi production khi nối Worker bằng ADMIN_KEY.</p>
            </div>
            {children}
          </main>
        </div>
      </main>
    </div>
  );
}
