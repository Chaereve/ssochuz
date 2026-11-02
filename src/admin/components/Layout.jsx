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
    ['new', 'Thêm bộ', 'plus'],
    ['edit', 'Sửa bộ', 'edit'],
    ['chapters', 'Chương', 'list'],
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
  chapters: 'Chương', cmts: 'Bình luận', reports: 'Báo lỗi',
  votes: 'Phiếu bầu', homepage: 'Homepage CMS', users: 'Tác giả', roles: 'Vai trò',
  stats: 'Thống kê', doctor: 'Kiểm tra dữ liệu', log: 'Nhật ký', settings: 'Cài đặt',
};

/* Page header chuẩn hoá cho mọi tab: title + mô tả ngắn đúng theo dữ liệu
   thật của từng module (không hứa tính năng không tồn tại). */
const PAGE_HEAD = {
  overview: ['Hôm nay', 'Số liệu thư viện và việc cần làm hôm nay.'],
  list: ['Thư viện', 'Lọc, sửa và xuất bản hàng loạt.'],
  new: ['Thêm bộ', 'Tạo bộ truyện mới, kèm chương đầu nếu có.'],
  chapters: ['Chương', 'Nháp, chờ duyệt và lịch đăng.'],
  cmts: ['Bình luận', 'Kiểm duyệt bình luận của độc giả.'],
  reports: ['Báo lỗi', 'Lỗi do độc giả gửi. Đánh dấu khi đã xử lý.'],
  votes: ['Phiếu bầu', 'Phiếu theo người đọc. Gỡ phiếu cần xác nhận.'],
  homepage: ['Trang chủ', 'Slide, bộ được chọn và lịch ra chương.'],
  users: ['Tác giả', 'Tác giả và số bộ đã xuất bản.'],
  roles: ['Vai trò', 'Nhân sự quản trị và quyền truy cập.'],
  stats: ['Thống kê', 'Lượt đọc và lượt thích.'],
  doctor: ['Kiểm tra dữ liệu', 'Đối chiếu KV, số chương và bộ thiếu dữ liệu.'],
  log: ['Nhật ký', '200 thao tác quản trị gần nhất.'],
  settings: ['Cài đặt', 'Sao lưu, khôi phục và nhập từ Blogger.'],
};

/* Nhãn nhóm của tab đang mở — dùng làm “eyebrow” cho tiêu đề trang, để người
   dùng biết mình đang ở khu nào mà không cần thêm một thanh breadcrumb riêng
   (thanh đó lặp lại đúng hai chữ đã có trong tiêu đề). */
function groupOf(tabId) {
  for (const group of NAV) {
    if (group.items.some(([id]) => id === tabId)) return group.group;
  }
  return 'Quản trị';
}

/* Bỏ dấu tiếng Việt để gõ “thu vien” vẫn tìm ra “Thư viện”. */
function fold(text) {
  return String(text || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase();
}

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

function connChip(state) {
  if (state.connecting) return { cls: 'warn', text: 'Đang kiểm tra kết nối' };
  if (state.online) return { cls: 'ok', text: 'Cloudflare KV · Online' };
  if (state.connError === 'badkey') return { cls: 'bad', text: 'Sai ADMIN_KEY' };
  if (state.connError === 'network') return { cls: 'bad', text: 'Lỗi kết nối Worker' };
  return { cls: 'warn', text: 'Dữ liệu tĩnh · Chỉ đọc', hint: 'Thay đổi chỉ lưu tạm trong phiên. Cần nối Worker bằng ADMIN_KEY để ghi KV.' };
}

/* Nút “Đổi nền sáng/tối” đã bỏ (2026-10-29): web chỉ còn nền tối — không còn
   gì để lật, nên không dựng nút thừa trên thanh công cụ. */

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
  const [drawer, setDrawer] = useState(false);
  const [q, setQ] = useState('');
  const [suggest, setSuggest] = useState({ nav: [], books: [] });
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
    const t = setTimeout(() => {
      const nq = fold(q.trim());
      if (!nq) { setSuggest({ nav: [], books: [] }); return; }
      const navHits = NAV.flatMap((g) => g.items)
        .filter(([id]) => !allowed || allowed.indexOf(id) >= 0)
        .filter(([id, label]) => fold(label).indexOf(nq) >= 0 || fold(id).indexOf(nq) >= 0)
        .slice(0, 5);
      const bookHits = lib.filter((b) => fold([b.title, b.author, b.slug].join(' ')).indexOf(nq) >= 0).slice(0, 6);
      setSuggest({ nav: navHits, books: bookHits });
    }, 160);
    return () => clearTimeout(t);
  }, [q, lib, allowed]);

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
    setSuggest({ nav: [], books: [] });
    if (onSearch) onSearch(q);
    else go('list');
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
                    {id === 'list' && lib.length ? <span class="ct">{lib.length}</span> : null}
                    {id === 'edit' && currentSlug ? <span class="ct">đang sửa</span> : null}
                    {id === 'reports' && openReports ? <span class="ct">{openReports}</span> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div class="v2side-foot">
          <span class={`v2conn ${chip.cls}`} title={chip.hint || chip.text}><span class="d"></span><b>{chip.text}</b></span>
          <div class={`v2qbar ${qLevel}`} title={quotaTitle}>
            <span class="lab"><span>Ghi KV hôm nay</span><b>{used} / {limit}</b></span>
            <span class="bar"><i style={{ width: `${pct(used, limit)}%` }}></i></span>
          </div>
          <p class="v2side-note">{state.online ? 'Thay đổi đi thẳng vào KV qua Worker.' : 'Chưa nối ADMIN_KEY — thay đổi chỉ nằm trong tab này.'}</p>
        </div>
      </aside>
      {drawer ? <div class="v2scrim" onClick={() => setDrawer(false)} /> : null}

      <div class="v2frame">
        <header class="v2top">
          <div class="in">
            <button class="hbtn icon v2burger" type="button" aria-label="Mở menu" onClick={() => setDrawer(true)}><Icon name="menu" /></button>
            <a class="logo v2mlogo" href="/" aria-label="Trang chủ ssochuz"><span class="dot"></span>ssochuz</a>
            <form class="v2search" onSubmit={submitSearch}>
              <Icon name="search" />
              <input class="inp" ref={searchRef} value={q} placeholder="Tìm bộ truyện…" title="Tìm nhanh (Ctrl+K)" onInput={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { setQ(''); setSuggest({ nav: [], books: [] }); } }} aria-label="Tìm trong quản trị" />
              <kbd class="v2kbd" aria-hidden="true">⌘K</kbd>
              {q.trim() ? (
                <div class="v2search-suggest" aria-label="Gợi ý tìm kiếm">
                  {suggest.nav.length ? <div class="v2ss-group">Điều hướng</div> : null}
                  {suggest.nav.map(([id, label, icon]) => (
                    <button type="button" key={'n-' + id} onClick={() => { setQ(''); setSuggest({ nav: [], books: [] }); go(id); }}>
                      <Icon name={icon} /><b>{label}</b><span class="grow"></span><kbd>↵</kbd>
                    </button>
                  ))}
                  {suggest.books.length ? <div class="v2ss-group">Bộ truyện</div> : null}
                  {suggest.books.map((b) => (
                    <button type="button" key={b.slug} onClick={() => { setQ(b.title || b.slug); setSuggest({ nav: [], books: [] }); if (onSearch) onSearch(b.title || b.slug); }}>
                      <Icon name="book" /><b>{b.title}</b><span class="sm muted">{b.author || b.slug}</span>
                    </button>
                  ))}
                  {!suggest.nav.length && !suggest.books.length
                    ? <div class="v2ss-empty">Không có mục nào khớp “{q.trim()}”.</div>
                    : null}
                </div>
              ) : null}
            </form>
            <span class="grow"></span>
            <button type="button" class={`v2quota ${qLevel}`} title={quotaTitle} onClick={() => go('doctor')}>
              <span>Ghi KV</span>{' '}<b>{used}/{limit}</b>
              {!quota.supported ? <em class="v2est">ước tính</em> : null}
              {quota.readSupported && quota.readWarn
                ? <em class="v2est" title={`Lượt đọc KV hôm nay (ước lượng): ${Number(quota.readsToday) || 0}/${Number(quota.readBudget) || 100000}`}>
                    đọc {Math.round((Number(quota.readsToday) || 0) / 1000)}k
                  </em>
                : null}
              <i style={{ width: `${pct(used, limit)}%` }}></i>
            </button>
            <div class="v2tools">
              <div class="v2user">
                <button class="hbtn admin-tool" type="button" title="Thông báo" aria-label="Thông báo" onClick={() => { setBellOpen(!bellOpen); setMenu(false); }}>
                  <Icon name="bell" />
                  {openReports + spam > 0 ? <span class="v2ndot">{openReports + spam > 9 ? '9+' : openReports + spam}</span> : null}
                </button>
                {bellOpen ? (
                  <div class="v2usermenu" role="menu" aria-label="Thông báo">
                    {bellItems.length
                      ? bellItems.map((it) => <button type="button" key={it.tab} role="menuitem" onClick={() => go(it.tab)}>{it.text}</button>)
                      : <div class="amtop"><span><b>Không có thông báo mới</b><span>Chưa có báo lỗi chưa xử lý hay bình luận nghi spam từ Worker.</span></span></div>}
                  </div>
                ) : null}
              </div>
              <a class="hbtn admin-tool" href="/" target="_blank" rel="noopener" title="Mở trang web ở tab mới" aria-label="Mở trang web ở tab mới"><Icon name="link" /><span class="admin-tool-label">Xem web</span></a>
              <div class="v2user">
                <button class="hbtn admin-tool" type="button" onClick={() => { setMenu(!menu); setBellOpen(false); }} aria-haspopup="menu" aria-expanded={menu} aria-label="Menu tài khoản">
                  <Icon name="user" /><span class="admin-tool-label">{roleLabel(role)}</span>
                </button>
                {menu ? (
                  <div class="v2usermenu" role="menu" aria-label="Tài khoản quản trị">
                    <div class="amtop"><span><b>{roleLabel(role)}</b><span>{chip.text}</span><span>{state.online ? state.apiBase : 'phiên tĩnh'}</span></span></div>
                    <button type="button" role="menuitem" onClick={() => { setMenu(false); go('settings'); }}>Cài đặt</button>
                    <button type="button" role="menuitem" onClick={() => { setMenu(false); go('doctor'); }}>Trạng thái kết nối</button>
                    <button type="button" role="menuitem" class="out" onClick={() => { setMenu(false); onDisconnect(); }}>{state.online ? 'Ngắt kết nối Worker' : 'Đóng phiên'}</button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </header>
        <main class="v2main">
          {(() => {
            /* Trang “Sửa bộ” tự đặt tiêu đề theo BỘ ĐANG MỞ (tên truyện), nên
               đầu trang ở đây chỉ vẽ cho các tab còn lại — trước đây màn sửa bộ
               có tới ba dòng tiêu đề xếp chồng: “Sửa bộ” (khung) → “Sửa
               metadata: …” (trong pane) → tab. Nay còn đúng một. */
            if (activeTab === 'edit') return null;
            const head = PAGE_HEAD[activeTab] || [CRUMBS[activeTab] || activeTab, ''];
            return (
              <header class="v2pagehead">
                <div class="v2head-text">
                  <span class="eyebrow">{groupOf(activeTab)}</span>
                  <h2>{head[0]}</h2>
                  {head[1] ? <p class="hint">{head[1]}</p> : null}
                </div>
                {activeTab === 'overview' ? (
                  <div class="v2head-actions">
                    <button class="btn ghost" type="button" onClick={() => go('list')}>Mở thư viện</button>
                    <button class="btn pri" type="button" onClick={() => go('new')}>Thêm bộ</button>
                  </div>
                ) : null}
              </header>
            );
          })()}
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
