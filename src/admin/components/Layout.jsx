import { h } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { pct } from '../utils/format.js';
import { roleLabel, visibleTabs } from '../utils/permissions.js';

const NAV = [
  { group: 'Tổng quan', items: [
    ['overview', 'Dashboard', 'chart'],
  ]},
  { group: 'Nội dung', items: [
    ['list', 'Thư viện', 'library'],
    ['new', 'Thêm bộ', 'plus'],
    ['edit', 'Sửa bộ', 'edit'],
    ['chapters', 'Chương', 'list'],
    ['genres', 'Thể loại', 'filter'],
  ]},
  { group: 'Cộng đồng', items: [
    ['cmts', 'Bình luận', 'chat'],
    ['reports', 'Báo lỗi', 'alert'],
    ['votes', 'Phiếu bầu', 'heart'],
  ]},
  { group: 'Trang chủ', items: [
    ['homepage', 'Homepage CMS', 'sparkle'],
  ]},
  { group: 'Người dùng', items: [
    ['users', 'Tác giả', 'users'],
    ['roles', 'Vai trò', 'shield'],
  ]},
  { group: 'Hệ thống', items: [
    ['stats', 'Thống kê', 'chart'],
    ['doctor', 'Kiểm tra dữ liệu', 'pulse'],
    ['log', 'Nhật ký', 'history'],
    ['settings', 'Cài đặt', 'gear'],
  ]},
];

const CRUMBS = {
  overview: 'Dashboard', list: 'Thư viện', new: 'Thêm bộ', edit: 'Sửa bộ',
  chapters: 'Chương', genres: 'Thể loại', cmts: 'Bình luận', reports: 'Báo lỗi',
  votes: 'Phiếu bầu', homepage: 'Homepage CMS', users: 'Tác giả', roles: 'Vai trò',
  stats: 'Thống kê', doctor: 'Kiểm tra dữ liệu', log: 'Nhật ký', settings: 'Cài đặt',
};

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

export function Layout({ state, activeTab, currentSlug = '', onTab, onDisconnect, onSearch, children }) {
  const quota = state.quota || {};
  const used = Number(quota.writesToday) || 0;
  const limit = Number(quota.limit) || 1000;
  const qLevel = quotaLevel(quota);
  const role = state.role || (state.mode === 'local' ? 'local' : state.mode === 'login' ? 'admin' : '—');
  const allowed = visibleTabs(role);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('ssochuz-admin-side') === '1'; } catch (e) { return false; }
  });
  const [drawer, setDrawer] = useState(false);
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState(false);
  const openReports = Number(state.reports && state.reports.open) || 0;
  const spam = Number((state.comments && state.comments.spam) || 0);

  useEffect(() => {
    try { localStorage.setItem('ssochuz-admin-side', collapsed ? '1' : '0'); } catch (e) {}
  }, [collapsed]);

  const nav = useMemo(() => NAV.map((g) => ({
    group: g.group,
    items: g.items.filter(([id]) => !allowed || allowed.indexOf(id) >= 0),
  })).filter((g) => g.items.length), [allowed]);

  function go(id) {
    setDrawer(false);
    onTab(id);
  }

  function submitSearch(e) {
    e.preventDefault();
    if (onSearch) onSearch(q);
    else go('list');
  }

  return (
    <div class={'v2app' + (collapsed ? ' v2collapsed' : '') + (drawer ? ' v2drawer-on' : '')}>
      <aside class="v2side" aria-label="Điều hướng quản trị">
        <div class="v2brand">
          <a class="logo" href="/" title="ssochuz library"><span class="dot"></span>ssochuz<i> admin</i></a>
          <button class="hbtn icon v2side-toggle" type="button" title="Thu gọn menu" onClick={() => setCollapsed(!collapsed)} aria-label="Thu gọn menu">
            <Icon name={collapsed ? 'right' : 'left'} />
          </button>
        </div>
        <nav class="snav v2aside" id="tabs">
          {nav.map((g) => (
            <div class="v2nav-group" key={g.group}>
              <span class="admin-nav-label">{g.group}</span>
              {g.items.map(([id, label, icon]) => {
                const enabled = id !== 'edit' || currentSlug;
                return (
                  <button type="button" key={id}
                    class={(activeTab === id ? 'on' : '') + (!enabled ? ' muted' : '')}
                    aria-current={activeTab === id ? 'page' : 'false'}
                    data-tab={id} onClick={() => go(id)} disabled={id === 'edit' && !currentSlug}>
                    <Icon name={icon} /><span>{label}</span>
                    {id === 'edit' && currentSlug ? <span class="ct">đang sửa</span> : null}
                    {id === 'reports' && openReports ? <span class="ct">{openReports}</span> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <p class="hint v2side-note">Ghi KV chỉ khi đã nối ADMIN_KEY. Thể loại thay tags.</p>
      </aside>
      {drawer ? <div class="v2scrim" onClick={() => setDrawer(false)} /> : null}

      <div class="v2frame">
        <header class="v2top abar">
          <div class="in">
            <button class="hbtn icon v2burger" type="button" aria-label="Mở menu" onClick={() => setDrawer(true)}><Icon name="menu" /></button>
            <form class="v2search" onSubmit={submitSearch}>
              <Icon name="search" />
              <input class="inp" value={q} placeholder="Tìm truyện, tác giả…" onInput={(e) => setQ(e.target.value)} aria-label="Tìm trong quản trị" />
            </form>
            <span class="grow"></span>
            <span class={`chip ${state.online ? 'ok' : 'warn'}`}><span class="d"></span><b>{state.online ? 'Cloudflare KV' : 'dữ liệu tĩnh'}</b></span>
            <span class={`v2quota ${qLevel}`} title={quota.supported ? 'Số ghi KV hôm nay từ Worker' : 'Worker hiện chưa trả writesToday; đang hiển thị counter ước tính phía client'}>
              <span>KV write</span><b>{used}/{limit}</b><i style={{ width: `${pct(used, limit)}%` }}></i>
            </span>
            <button class="hbtn admin-tool" type="button" title="Thông báo" aria-label="Thông báo" onClick={() => go(openReports ? 'reports' : 'cmts')}>
              <Icon name="bell" />
              {openReports + spam > 0 ? <span class="v2ndot">{openReports + spam > 9 ? '9+' : openReports + spam}</span> : null}
            </button>
            <a class="hbtn admin-tool" href="/" target="_blank" rel="noopener" title="Mở trang web" aria-label="Mở trang web"><Icon name="right" /><span class="admin-tool-label">Web</span></a>
            <ThemeButton />
            <div class="v2user">
              <button class="hbtn admin-tool" type="button" onClick={() => setMenu(!menu)} aria-haspopup="menu" aria-expanded={menu}>
                <Icon name="user" /><span class="admin-tool-label">{roleLabel(role)}</span>
              </button>
              {menu ? (
                <div class="v2usermenu" role="menu">
                  <div class="amtop"><span><b>{roleLabel(role)}</b><span>{state.online ? state.apiBase : 'phiên tĩnh'}</span></span></div>
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); go('settings'); }}>Cài đặt</button>
                  <button type="button" role="menuitem" class="out" onClick={() => { setMenu(false); onDisconnect(); }}>{state.online ? 'Ngắt kết nối' : 'Đóng phiên'}</button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <main class="amain v2main">
          <nav class="crumb v2crumbs">
            <a href="/">Trang chủ</a><span>›</span>
            <button type="button" class="lk" onClick={() => go('overview')}>Admin</button><span>›</span>
            <b>{CRUMBS[activeTab] || activeTab}{activeTab === 'edit' && currentSlug ? ' · ' + currentSlug : ''}</b>
          </nav>
          {children}
        </main>
      </div>
    </div>
  );
}
