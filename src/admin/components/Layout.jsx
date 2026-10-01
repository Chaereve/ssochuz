import { h } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { pct } from '../utils/format.js';
import { roleLabel, visibleTabs } from '../utils/permissions.js';
import { spamSuspects } from '../utils/overview.js';

/* Điều hướng: 6 nhóm, 14 mục. "Sửa bộ" không còn là mục nav — nó là trang chi tiết
   mở từ Thư viện (trước đây là mục bị vô hiệu hoá khi chưa chọn bộ). */
const NAV = [
  { group: 'Tổng quan', items: [
    ['overview', 'Dashboard', 'chart'],
  ]},
  { group: 'Nội dung', items: [
    ['list', 'Thư viện', 'library'],
    ['new', 'Thêm bộ', 'plus'],
    ['chapters', 'Chương', 'list'],
  ]},
  { group: 'Cộng đồng', items: [
    ['cmts', 'Bình luận', 'chat'],
    ['reports', 'Báo lỗi', 'alert'],
    ['votes', 'Phiếu bầu', 'heart'],
  ]},
  { group: 'Trang chủ', items: [
    ['homepage', 'Trang chủ', 'sparkle'],
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
  chapters: 'Chương', cmts: 'Bình luận', reports: 'Báo lỗi',
  votes: 'Phiếu bầu', homepage: 'Trang chủ', users: 'Tác giả', roles: 'Vai trò',
  stats: 'Thống kê', doctor: 'Kiểm tra dữ liệu', log: 'Nhật ký', settings: 'Cài đặt',
};

/* Một dòng đầu trang cho mọi tab: tựa + mô tả ngắn đúng theo dữ liệu thật của
   từng module (không hứa tính năng không tồn tại). */
const PAGE_HEAD = {
  overview: ['Dashboard', 'Tình trạng thư viện, việc cần làm hôm nay và sức khỏe hệ thống.'],
  list: ['Thư viện', 'Toàn bộ bộ truyện — lọc theo trạng thái, thao tác hàng loạt, sửa hoặc xoá từng bộ.'],
  new: ['Thêm bộ', 'Tạo bộ truyện mới. Khi đã nối Worker, book JSON và registry được ghi ngay.'],
  chapters: ['Chương', 'Hàng đợi nháp, chờ duyệt, hẹn giờ và các bộ mới cập nhật — chỉ dùng metadata registry.'],
  cmts: ['Bình luận', 'Kiểm duyệt bình luận độc giả đang lưu trong KV.'],
  reports: ['Báo lỗi', 'Báo lỗi từ người đọc — xem chi tiết và đánh dấu đã xử lý.'],
  votes: ['Phiếu bầu', 'Xem phiếu bầu khóa theo người; gỡ/reset là thao tác ghi có xác nhận mạnh.'],
  homepage: ['Trang chủ', 'Slide trang chủ, lựa chọn biên tập, lịch ra chương và thông báo.'],
  users: ['Tác giả', 'Tác giả gắn trên bộ truyện và số liệu xuất bản theo từng người.'],
  roles: ['Vai trò', 'Nhân sự quản trị và phạm vi giao diện theo vai trò.'],
  stats: ['Thống kê', 'Lượt đọc và phiếu thích đọc từ KV — tab này chỉ đọc, không ghi.'],
  doctor: ['Kiểm tra dữ liệu', 'Audit KV, quét lệch số chương/chương rỗng và công cụ đếm lại.'],
  log: ['Nhật ký', 'Tối đa 200 thao tác quản trị gần nhất từ khóa log.'],
  settings: ['Cài đặt', 'Backup, khôi phục, nhập Blogger, stats cache và overflow KV.'],
};

const GROUP_KEY = 'ssochuz-admin-navgroups';

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

/* A2: mức dùng LƯỢT ĐỌC KV (trần free 100.000/ngày) — pill quota phải phản ánh
   mức xấu hơn trong hai mức, vì vượt trần đọc cũng làm trang đọc lỗi. */
function quotaReadLevel(quota) {
  if (!quota || !quota.readSupported) return 'ok';
  if (quota.readCritical) return 'critical';
  if (quota.readWarn) return 'warning';
  return 'ok';
}
const LEVEL_RANK = { ok: 0, warning: 1, critical: 2, blocked: 3 };
function worseLevel(a, b) { return (LEVEL_RANK[b] || 0) > (LEVEL_RANK[a] || 0) ? b : a; }

/* Hai bản chữ cho cùng một trạng thái: bản đầy đủ ở màn rộng, bản ngắn khi thanh
   trên phải nhường chỗ (≤1440px). Đầy đủ luôn nằm trong title. */
function connChip(state) {
  if (state.connecting) return { cls: 'warn', text: 'Đang kiểm tra kết nối', short: 'Đang kiểm tra' };
  if (state.online) return { cls: 'ok', text: 'Cloudflare KV · Online', short: 'KV · Online' };
  if (state.connError === 'badkey') return { cls: 'bad', text: 'Sai ADMIN_KEY', short: 'Sai khoá' };
  if (state.connError === 'network') return { cls: 'bad', text: 'Lỗi kết nối Worker', short: 'Lỗi Worker' };
  return { cls: 'warn', text: 'Dữ liệu tĩnh · Chỉ đọc', short: 'Tĩnh · chỉ đọc' };
}

function setTheme(dark) {
  let next = dark ? 'light' : 'dark';
  if (window.CZ && window.CZ.themeToggle) next = window.CZ.themeToggle() || next;
  else {
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('ssochuz-theme', next); } catch (e) {}
  }
  return next === 'dark';
}

function ThemeButton({ dark, onToggle }) {
  const html = window.CZ && window.CZ.icon ? window.CZ.icon(dark ? 'sun' : 'moon', 'i-s') : '';
  return (
    <button class="hbtn admin-tool icon v2theme" type="button" onClick={onToggle} title="Đổi nền sáng/tối" aria-label="Đổi nền sáng/tối">
      <span dangerouslySetInnerHTML={{ __html: html }} />
    </button>
  );
}

/* Trạng thái mở/đóng của từng nhóm nav — nhớ theo máy, mặc định mở. */
function readGroups() {
  try { return JSON.parse(localStorage.getItem(GROUP_KEY) || '{}') || {}; } catch (e) { return {}; }
}

export function Layout({ state, activeTab, currentSlug = '', currentTitle = '', onTab, onDisconnect, onSearch, shortcuts, children }) {
  const quota = state.quota || {};
  const used = Number(quota.writesToday) || 0;
  const limit = Number(quota.limit) || 1000;
  const qLevel = worseLevel(quotaLevel(quota), quotaReadLevel(quota));
  const chip = connChip(state);
  const role = state.role || (state.mode === 'local' ? 'local' : state.mode === 'login' ? 'admin' : '—');
  const allowed = visibleTabs(role);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('ssochuz-admin-side') === '1'; } catch (e) { return false; }
  });
  const [groups, setGroups] = useState(readGroups);
  const [drawer, setDrawer] = useState(false);
  const [q, setQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [dark, setDark] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark');
  const [suggest, setSuggest] = useState([]);
  const [menu, setMenu] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const openReports = Number(state.reports && state.reports.open) || 0;
  const spam = spamSuspects(state.comments).length;
  const lib = ((state.registry && state.registry.lib) || []);
  const searchRef = shortcuts && shortcuts.searchInputRef ? shortcuts.searchInputRef : null;

  useEffect(() => {
    try { localStorage.setItem('ssochuz-admin-side', collapsed ? '1' : '0'); } catch (e) {}
  }, [collapsed]);

  useEffect(() => {
    try { localStorage.setItem(GROUP_KEY, JSON.stringify(groups)); } catch (e) {}
  }, [groups]);

  /* Esc đóng mọi lớp nổi — ngăn kéo, menu tài khoản, chuông, gợi ý tìm kiếm. */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      setDrawer(false); setMenu(false); setBellOpen(false); setSuggest([]); setSearchOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

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

  const toggleTheme = () => setDark(setTheme(dark));

  function go(id) {
    setDrawer(false);
    setBellOpen(false);
    setMenu(false);
    setSuggest([]);
    onTab(id);
  }

  function submitSearch(e) {
    e.preventDefault();
    setSuggest([]);
    if (onSearch) onSearch(q);
    else go('list');
  }

  function toggleGroup(name, open) {
    if (collapsed) return;  // đang ở rail thì nhóm luôn mở, không ghi đè lựa chọn
    setGroups((prev) => Object.assign({}, prev, { [name]: open }));
  }

  const quotaTitle = (quota.supported
    ? 'Số ghi KV hôm nay từ Worker /api/admin/kv. Trần free-tier sản phẩm: 1000 lượt/ngày.'
    : 'Worker chưa trả writesToday; số này là ước tính phía client. Bấm để mở Kiểm tra dữ liệu.')
    + (used >= limit ? ' Đã chặn mọi thao tác ghi.' : used >= 950 ? ' Sắp chạm trần.' : used >= 800 ? ' Đã qua ngưỡng cảnh báo.' : '')
    + (quota.readSupported
      ? ` Lượt ĐỌC KV hôm nay (ước lượng, trần 100.000): ${Number(quota.readsToday) || 0}.`
      + (quota.readCritical ? ' Sắp chạm trần đọc.' : quota.readWarn ? ' Đã qua 70% trần đọc.' : '')
      : ' Worker chưa trả readsToday.');

  const bellItems = [];
  if (openReports) bellItems.push({ tab: 'reports', text: openReports + ' báo lỗi chưa xử lý' });
  if (spam) bellItems.push({ tab: 'cmts', text: spam + ' bình luận nghi spam' });

  const head = activeTab === 'edit'
    ? [currentTitle || currentSlug || 'Sửa bộ', 'Metadata, ảnh bìa, khóa mật mã và soạn chương. Thay đổi chỉ ghi Cloudflare KV khi đã nối ADMIN_KEY.']
    : (PAGE_HEAD[activeTab] || [CRUMBS[activeTab] || activeTab, '']);

  return (
    <div class={'v2app' + (collapsed ? ' v2collapsed' : '') + (drawer ? ' v2drawer-on' : '')}>
      <aside class="v2side" aria-label="Điều hướng quản trị">
        <div class="v2brand">
          <a class="logo" href="/" title="ssochuz library"><span class="dot"></span>ssochuz<i> admin</i></a>
          <button class="hbtn icon v2side-toggle" type="button" title={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
            aria-label={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>
            <Icon name={collapsed ? 'right' : 'left'} />
          </button>
          <button class="hbtn icon v2side-close" type="button" title="Đóng menu" aria-label="Đóng menu" onClick={() => setDrawer(false)}>×</button>
        </div>
        <nav class="snav v2aside" id="tabs">
          {nav.map((g) => (
            <details class="v2nav-group" key={g.group} open={collapsed || groups[g.group] !== false}
              onToggle={(e) => toggleGroup(g.group, e.currentTarget.open)}>
              <summary class="admin-nav-label">{g.group}<span class="admin-nav-chevron" aria-hidden="true"><Icon name="down" /></span></summary>
              <div class="v2nav-items">
                {g.items.map(([id, label, icon]) => (
                  <button type="button" key={id}
                    class={activeTab === id ? 'on' : ''}
                    aria-current={activeTab === id ? 'page' : 'false'}
                    title={label}
                    data-tab={id} onClick={() => go(id)}>
                    <Icon name={icon} /><span>{label}</span>
                    {id === 'reports' && openReports ? <span class="ct">{openReports}</span> : null}
                  </button>
                ))}
              </div>
            </details>
          ))}
        </nav>
        <p class="hint v2side-note">Ghi KV chỉ khi đã nối ADMIN_KEY.</p>
      </aside>
      <div class={'v2scrim' + (drawer ? ' on' : '')} onClick={() => setDrawer(false)} />

      <div class="v2frame">
        <header class={'v2top' + (searchOpen ? ' v2search-on' : '')}>
          <div class="in">
            <button class="hbtn icon v2burger" type="button" aria-label="Mở menu" aria-expanded={drawer} onClick={() => setDrawer(true)}><Icon name="menu" /></button>
            <a class="logo v2mlogo" href="/" aria-label="Trang chủ ssochuz"><span class="dot"></span>ssochuz</a>
            <form class="v2search" role="search" onSubmit={submitSearch}>
              <Icon name="search" />
              <input class="inp" ref={searchRef} value={q} placeholder="Tìm truyện, tác giả…" title="Tìm trong quản trị (Ctrl+K)" onInput={(e) => setQ(e.target.value)} aria-label="Tìm trong quản trị" />
              <button class="hbtn icon v2search-close" type="button" aria-label="Đóng tìm kiếm" onClick={() => { setSearchOpen(false); setSuggest([]); }}>×</button>
              {suggest.length ? (
                <div class="v2search-suggest" role="listbox" aria-label="Gợi ý tìm kiếm">
                  {suggest.map((b) => (
                    <button type="button" key={b.slug} onClick={() => { setQ(b.title || b.slug); setSuggest([]); if (onSearch) onSearch(b.title || b.slug); }}>
                      <b>{b.title}</b> <span class="sm muted">{b.author || b.slug}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </form>
            <div class="v2tools">
              <span class={`chip ${chip.cls}`} title={chip.text}><span class="d"></span><b class="lg">{chip.text}</b><b class="sm2">{chip.short}</b></span>
              <button class="hbtn admin-tool icon v2search-toggle" type="button" title="Tìm kiếm" aria-label="Tìm kiếm" onClick={() => setSearchOpen(true)}><Icon name="search" /></button>
              <button type="button" class={`v2quota ${qLevel}`} title={quotaTitle} onClick={() => go('doctor')}>
                <span>KV write</span><b>{used}/{limit}</b>
                {!quota.supported ? <em class="v2est">ước tính</em> : null}
                {quota.readSupported && quota.readWarn
                  ? <em class="v2est" title={`Lượt đọc KV hôm nay (ước lượng): ${Number(quota.readsToday) || 0}/${Number(quota.readBudget) || 100000}`}>
                      đọc {Math.round((Number(quota.readsToday) || 0) / 1000)}k
                    </em>
                  : null}
                <i style={{ width: `${pct(used, limit)}%` }}></i>
              </button>
              <div class="v2user">
                <button class="hbtn admin-tool icon" type="button" title="Thông báo" aria-label="Thông báo" aria-expanded={bellOpen} onClick={() => { setBellOpen(!bellOpen); setMenu(false); }}>
                  <Icon name="bell" />
                  {openReports + spam > 0 ? <span class="v2ndot">{openReports + spam > 9 ? '9+' : openReports + spam}</span> : null}
                </button>
                {bellOpen ? (
                  <div class="v2usermenu" role="menu" aria-label="Thông báo">
                    {bellItems.length
                      ? bellItems.map((it) => <button type="button" key={it.tab} role="menuitem" onClick={() => go(it.tab)}>{it.text}</button>)
                      : <div class="amtop"><b>Không có thông báo mới</b><span>Chưa có báo lỗi chưa xử lý hay bình luận nghi spam từ Worker.</span></div>}
                  </div>
                ) : null}
              </div>
              <a class="hbtn admin-tool v2web" href="/" target="_blank" rel="noopener" title="Mở trang web" aria-label="Mở trang web"><Icon name="right" /><span class="admin-tool-label">Web</span></a>
              <ThemeButton dark={dark} onToggle={toggleTheme} />
              <div class="v2user">
                <button class="hbtn admin-tool" type="button" onClick={() => { setMenu(!menu); setBellOpen(false); }} aria-haspopup="menu" aria-expanded={menu} aria-label="Menu tài khoản">
                  <Icon name="user" /><span class="admin-tool-label">{roleLabel(role)}</span>
                </button>
                {menu ? (
                  <div class="v2usermenu" role="menu" aria-label="Tài khoản quản trị">
                    <div class="amtop"><b>{roleLabel(role)}</b><span>{chip.text}</span><span>{state.online ? state.apiBase : 'phiên tĩnh'}</span></div>
                    <button type="button" role="menuitem" onClick={() => { setMenu(false); go('settings'); }}>Cài đặt</button>
                    <a role="menuitem" href="/" target="_blank" rel="noopener" onClick={() => setMenu(false)}>Mở trang web</a>
                    <button type="button" role="menuitem" onClick={() => { setMenu(false); go('doctor'); }}>Trạng thái kết nối</button>
                    <button type="button" role="menuitem" onClick={() => { setMenu(false); toggleTheme(); }}>{dark ? 'Nền sáng' : 'Nền tối'}</button>
                    <button type="button" role="menuitem" class="out" onClick={() => { setMenu(false); onDisconnect(); }}>{state.online ? 'Ngắt kết nối Worker' : 'Đóng phiên'}</button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </header>
        <main class="amain v2main">
          <header class="v2pagehead">
            <nav class="v2crumbs" aria-label="Đường dẫn">
              {activeTab === 'edit'
                ? <button type="button" class="lk" onClick={() => go('list')}>Thư viện</button>
                : <a href="/">Trang chủ</a>}
              <span aria-hidden="true">›</span>
              <span class="here">{CRUMBS[activeTab] || head[0]}</span>
            </nav>
            <h2>{head[0]}</h2>
            {head[1] ? <p class="v2pagesub">{head[1]}</p> : null}
          </header>
          {!state.online ? (
            <div class="v2staticbar" role="status" style="margin-top:14px">
              <b>Chế độ dữ liệu tĩnh</b>
              Thay đổi chỉ là nháp phiên và sẽ mất khi đóng tab.
            </div>
          ) : null}
          {used >= limit && state.online ? (
            <div class="v2partial" role="alert" style="margin-top:14px">
              <span>Quota KV hôm nay đã hết ({used}/{limit}). Đã chặn mọi thao tác ghi. Vẫn đọc được dữ liệu; nháp editor còn trong trình duyệt.</span>
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
