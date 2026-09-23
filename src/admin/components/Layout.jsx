import { h } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { pct } from '../utils/format.js';
import { roleLabel, visibleTabs } from '../utils/permissions.js';
import { spamSuspects } from '../utils/overview.js';

const NAV = [
  { group: 'Tổng quan', items: [
    ['overview', 'Dashboard', 'chart'],
  ]},
  { group: 'Nội dung', items: [
    ['list', 'Thư viện', 'library'],
    ['classify', 'Phân loại', 'filter'],
    ['new', 'Thêm bộ', 'plus'],
    ['edit', 'Sửa bộ', 'edit'],
    ['chapters', 'Chương', 'list'],
    ['genres', 'Thể loại', 'sparkle'],
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
  overview: 'Dashboard', list: 'Thư viện', classify: 'Phân loại', new: 'Thêm bộ', edit: 'Sửa bộ',
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
  const limit = Number(quota && quota.limit) || 1000;
  if (used >= limit) return 'blocked';
  if (used >= (quota && quota.criticalThreshold || 950)) return 'critical';
  if (used >= (quota && quota.warningThreshold || 800)) return 'warning';
  return 'ok';
}

function connChip(state) {
  if (state.connecting) return { cls: 'warn', text: 'Đang kiểm tra kết nối' };
  if (state.online) return { cls: 'ok', text: 'Cloudflare KV · Online' };
  if (state.connError === 'badkey') return { cls: 'bad', text: 'Sai ADMIN_KEY' };
  if (state.connError === 'network') return { cls: 'bad', text: 'Lỗi kết nối Worker' };
  return { cls: 'warn', text: 'Dữ liệu tĩnh · Chỉ đọc' };
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

export function Layout({ state, activeTab, currentSlug = '', currentTitle = '', onTab, onDisconnect, onSearch, children }) {
  const quota = state.quota || {};
  const used = Number(quota.writesToday) || 0;
  const limit = Number(quota.limit) || 1000;
  const qLevel = quotaLevel(quota);
  const chip = connChip(state);
  const role = state.role || (state.mode === 'local' ? 'local' : state.mode === 'login' ? 'admin' : '—');
  const allowed = visibleTabs(role);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('ssochuz-admin-side') === '1'; } catch (e) { return false; }
  });
  const [drawer, setDrawer] = useState(false);
  const [q, setQ] = useState('');
  const [suggest, setSuggest] = useState([]);
  const [menu, setMenu] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const openReports = Number(state.reports && state.reports.open) || 0;
  const spam = spamSuspects(state.comments).length;
  const lib = ((state.registry && state.registry.lib) || []);

  useEffect(() => {
    try { localStorage.setItem('ssochuz-admin-side', collapsed ? '1' : '0'); } catch (e) {}
  }, [collapsed]);

  useEffect(() => {
    const t = setTimeout(() => {
      const query = q.trim().toLowerCase();
      if (!query || query.length < 2) { setSuggest([]); return; }
      const hits = lib.filter((b) => {
        const hay = [b.title, b.author, b.slug].join(' ').toLowerCase();
        return hay.indexOf(query) >= 0;
      }).slice(0, 8);
      setSuggest(hits);
    }, 350);
    return () => clearTimeout(t);
  }, [q, lib]);

  const nav = useMemo(() => NAV.map((g) => ({
    group: g.group,
    items: g.items.filter(([id]) => !allowed || allowed.indexOf(id) >= 0),
  })).filter((g) => g.items.length), [allowed]);

  function go(id) {
    setDrawer(false);
    setBellOpen(false);
    setMenu(false);
    onTab(id);
  }

  function submitSearch(e) {
    e.preventDefault();
    setSuggest([]);
    if (onSearch) onSearch(q);
    else go('list');
  }

  const quotaTitle = (quota.supported
    ? 'Số ghi KV hôm nay từ Worker /api/admin/kv. Trần free-tier sản phẩm: 1000 lượt/ngày.'
    : 'Worker chưa trả writesToday; số này là ước tính phía client. Bấm để mở Kiểm tra dữ liệu.')
    + (used >= limit ? ' Đã chặn mọi thao tác ghi.' : used >= 950 ? ' Sắp chạm trần.' : used >= 800 ? ' Đã qua ngưỡng cảnh báo.' : '');

  const bellItems = [];
  if (openReports) bellItems.push({ tab: 'reports', text: openReports + ' báo lỗi chưa xử lý' });
  if (spam) bellItems.push({ tab: 'cmts', text: spam + ' bình luận nghi spam' });

  return (
    <div class={'v2app' + (collapsed ? ' v2collapsed' : '') + (drawer ? ' v2drawer-on' : '')}>
      <aside class="v2side" aria-label="Điều hướng quản trị">
        <div class="v2brand">
          <a class="logo" href="/" title="ssochuz library"><span class="dot"></span>ssochuz<i> admin</i></a>
          <button class="hbtn icon v2side-toggle" type="button" title="Thu gọn menu" onClick={() => setCollapsed(!collapsed)} aria-label="Thu gọn menu">
            <Icon name={collapsed ? 'right' : 'left'} />
          </button>
          <button class="hbtn icon v2side-close" type="button" title="Đóng menu" aria-label="Đóng menu" onClick={() => setDrawer(false)}>×</button>
        </div>
        <nav class="snav v2aside" id="tabs">
          {nav.map((g) => (
            <div class="v2nav-group" key={g.group}>
              <span class="admin-nav-label">{g.group}</span>
              {g.items.map(([id, label, icon]) => {
                const enabled = id !== 'edit' || currentSlug;
                const editTip = id === 'edit' && !currentSlug ? 'Hãy chọn một bộ truyện trong Thư viện trước.' : label;
                return (
                  <button type="button" key={id}
                    class={(activeTab === id ? 'on' : '') + (!enabled ? ' muted' : '')}
                    aria-current={activeTab === id ? 'page' : 'false'}
                    title={editTip}
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
              {suggest.length ? (
                <div class="v2search-suggest" role="listbox">
                  {suggest.map((b) => (
                    <button type="button" key={b.slug} onClick={() => { setQ(b.title || b.slug); setSuggest([]); if (onSearch) onSearch(b.title || b.slug); }}>
                      <b>{b.title}</b> <span class="sm muted">{b.author || b.slug}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </form>
            <span class="grow"></span>
            <span class={`chip ${chip.cls}`} title={chip.text}><span class="d"></span><b>{chip.text}</b></span>
            <button type="button" class={`v2quota ${qLevel}`} title={quotaTitle} onClick={() => go('doctor')}>
              <span>KV write</span><b>{used}/{limit}</b>
              {!quota.supported ? <em class="v2est">ước tính</em> : null}
              <i style={{ width: `${pct(used, limit)}%` }}></i>
            </button>
            <div class="v2user">
              <button class="hbtn admin-tool" type="button" title="Thông báo" aria-label="Thông báo" onClick={() => { setBellOpen(!bellOpen); setMenu(false); }}>
                <Icon name="bell" />
                {openReports + spam > 0 ? <span class="v2ndot">{openReports + spam > 9 ? '9+' : openReports + spam}</span> : null}
              </button>
              {bellOpen ? (
                <div class="v2usermenu" role="menu">
                  {bellItems.length
                    ? bellItems.map((it) => <button type="button" key={it.tab} role="menuitem" onClick={() => go(it.tab)}>{it.text}</button>)
                    : <div class="amtop"><span><b>Không có thông báo mới</b><span>Chưa có báo lỗi chưa xử lý hay bình luận nghi spam từ Worker.</span></span></div>}
                </div>
              ) : null}
            </div>
            <a class="hbtn admin-tool" href="/" target="_blank" rel="noopener" title="Mở trang web" aria-label="Mở trang web"><Icon name="right" /><span class="admin-tool-label">Web</span></a>
            <ThemeButton />
            <div class="v2user">
              <button class="hbtn admin-tool" type="button" onClick={() => { setMenu(!menu); setBellOpen(false); }} aria-haspopup="menu" aria-expanded={menu}>
                <Icon name="user" /><span class="admin-tool-label">{roleLabel(role)}</span>
              </button>
              {menu ? (
                <div class="v2usermenu" role="menu">
                  <div class="amtop"><span><b>{roleLabel(role)}</b><span>{chip.text}</span><span>{state.online ? state.apiBase : 'phiên tĩnh'}</span></span></div>
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); go('settings'); }}>Cài đặt</button>
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); go('doctor'); }}>Trạng thái kết nối</button>
                  <button type="button" role="menuitem" class="out" onClick={() => { setMenu(false); onDisconnect(); }}>{state.online ? 'Ngắt kết nối Worker' : 'Đóng phiên'}</button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <main class="amain v2main">
          <nav class="crumb v2crumbs">
            <a href="/">Trang chủ</a><span>›</span>
            <button type="button" class="lk" onClick={() => go('overview')}>Admin</button><span>›</span>
            {activeTab === 'edit' ? (
              <span>
                <button type="button" class="lk" onClick={() => go('list')}>Thư viện</button><span> › </span>
                <b>{currentTitle || currentSlug || 'Sửa bộ'}</b><span> › </span><b>Sửa bộ</b>
              </span>
            ) : <b>{CRUMBS[activeTab] || activeTab}</b>}
          </nav>
          {!state.online ? (
            <div class="v2staticbar" role="status">
              <b>Chế độ dữ liệu tĩnh</b>
              Thay đổi chỉ là nháp phiên và sẽ mất khi đóng tab.
            </div>
          ) : null}
          {used >= limit && state.online ? (
            <div class="v2partial" role="alert">
              <span>Quota KV hôm nay đã hết ({used}/{limit}). Đã chặn mọi thao tác ghi. Vẫn đọc được dữ liệu; nháp editor còn trong trình duyệt.</span>
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
