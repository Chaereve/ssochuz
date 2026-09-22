import { h } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { pct } from '../utils/format.js';

function num(value) { return Number(value || 0).toLocaleString('vi-VN'); }
function dateText(value) {
  if (!value) return '—';
  try { return new Date(value).toLocaleString('vi-VN'); } catch (e) { return String(value); }
}
function titleOf(registry, slug) {
  const book = ((registry && registry.lib) || []).find((item) => item.slug === slug);
  return (book && book.title) || slug || '—';
}
function StoryLink({ registry, slug }) {
  const href = window.CZ && window.CZ.storyURL ? window.CZ.storyURL(slug) : '/truyen/' + slug + '/';
  return <a href={href} target="_blank" rel="noreferrer">{titleOf(registry, slug)} ↗</a>;
}
function apiAsset(state, url) {
  const value = String(url || '');
  const base = String((state && state.apiBase) || (window.CZ && window.CZ.API) || '').replace(/\/+$/, '');
  return base && /^\/api\/img\//i.test(value) ? base + value : value;
}
function NeedOnline({ state, children }) {
  if (state.online) return children;
  return <div class="msgbar show info">Module này đọc dữ liệu trong KV nên cần nối Worker bằng ADMIN_KEY. Dữ liệu tĩnh vẫn xem được ở tab Tổng quan/Thư viện.</div>;
}
function LoaderButton({ busy, onClick, children }) {
  return <button class="btn ghost sm" type="button" disabled={busy} onClick={onClick}>{busy ? 'Đang đọc…' : children}</button>;
}

export function DoctorPanel({ state, onKvAudit, onScanBooks, onRecount, onReload }) {
  const [busy, setBusy] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [audit, setAudit] = useState(null);
  const [scan, setScan] = useState(null);
  const [error, setError] = useState('');
  const lib = (state.registry && state.registry.lib) || [];
  const issues = useMemo(() => {
    const seen = {}, dup = [], missingTitle = [], missingCover = [], missingSynopsis = [];
    lib.forEach((book) => {
      if (!book.slug) dup.push('(thiếu slug)');
      else if (seen[book.slug]) dup.push(book.slug);
      seen[book.slug] = 1;
      if (!String(book.title || '').trim()) missingTitle.push(book.slug || '?');
      if (!String(book.thumb || book.slide || '').trim()) missingCover.push(book.slug || '?');
      if (!String(book.synFull || book.syn || '').trim()) missingSynopsis.push(book.slug || '?');
    });
    return { dup, missingTitle, missingCover, missingSynopsis };
  }, [state.registry]);
  const load = async () => {
    if (!onKvAudit) return;
    setBusy(true); setError('');
    try { setAudit(await onKvAudit()); }
    catch (e) { setError(e.message || String(e)); }
    finally { setBusy(false); }
  };
  const runScan = async () => {
    if (!onScanBooks) return;
    setScanBusy(true); setError('');
    try { setScan(await onScanBooks()); }
    catch (e) { setError(e.message || String(e)); }
    finally { setScanBusy(false); }
  };
  useEffect(() => { if (state.online && !audit && !busy) load(); }, [state.online]);
  return <div id="pane-doctor" class="v2pane">
    <section class="card2">
      <div class="row"><h3>Kiểm tra dữ liệu</h3><span class="grow"></span><button class="btn ghost sm" type="button" onClick={onReload}>Đọc lại registry</button><button class="btn ghost sm" type="button" disabled={scanBusy} onClick={runScan}>{scanBusy ? 'Đang quét…' : 'Quét book'}</button><LoaderButton busy={busy} onClick={load}>Audit KV</LoaderButton></div>
      <p class="hint">Chạy hoàn toàn trên dữ liệu hiện có; không đổi schema. “Quét book” chỉ đọc từng book để tìm lệch số chương/rỗng; “Đếm lại” mới là thao tác ghi.</p>
      <div class="tiles v2tiles4">
        <div class="tile"><b>{num(lib.length)}</b><span>bộ trong registry</span></div>
        <div class="tile"><b>{num(issues.dup.length)}</b><span>slug trùng/thiếu</span></div>
        <div class="tile"><b>{num(issues.missingCover.length)}</b><span>thiếu bìa</span></div>
        <div class="tile"><b>{num(issues.missingSynopsis.length)}</b><span>thiếu mô tả</span></div>
      </div>
      {error ? <div class="msgbar show err">{error}</div> : null}
      <div class="v2ops-grid">
        <div class="v2mini"><b>Registry quick check</b><p class="hint">Slug trùng: {issues.dup.slice(0, 6).join(', ') || 'không thấy'}</p><p class="hint">Thiếu tên: {issues.missingTitle.slice(0, 6).join(', ') || 'không thấy'}</p></div>
        <div class="v2mini"><b>KV write quota</b><p class="hint">Đang tính: {num(state.quota && state.quota.writesToday)}/{num(state.quota && state.quota.limit || 1000)} lượt ghi hôm nay ({state.quota && state.quota.source}).</p><span class="kvbar"><span style={{ width: pct(state.quota && state.quota.writesToday, state.quota && state.quota.limit || 1000) + '%' }}></span></span></div>
      </div>
      {scan ? <div class="v2doctor-scan">
        <div class="tiles v2tiles4"><div class="tile"><b>{num(scan.scanned)}</b><span>book đã quét ({scan.source})</span></div><div class="tile"><b>{num(scan.missing)}</b><span>thiếu book</span></div><div class="tile"><b>{num(scan.mismatch)}</b><span>lệch số chương</span></div><div class="tile"><b>{num(scan.empty)}</b><span>chương rỗng</span></div></div>
        {scan.rows && scan.rows.length ? <div class="v2table-wrap"><table class="tbl v2book-table"><thead><tr><th>Bộ</th><th>Vấn đề</th><th>Registry</th><th>Book</th></tr></thead><tbody>{scan.rows.map((row) => <tr><td><StoryLink registry={state.registry} slug={row.slug} /></td><td>{row.issue}</td><td>{row.registry == null ? '—' : num(row.registry)}</td><td>{row.actual == null ? '—' : num(row.actual)}</td></tr>)}</tbody></table></div> : <div class="msgbar show ok">Quét xong, chưa thấy lệch lớn trong book.</div>}
      </div> : null}
      {audit ? <div class="v2table-wrap"><table class="tbl v2book-table"><thead><tr><th>Prefix</th><th>Keys</th><th>Bytes biết được</th><th>Không metadata</th></tr></thead><tbody>{(audit.groups || []).map((g) => <tr><td><b>{g.prefix}</b></td><td>{num(g.keys)}</td><td>{num(g.bytes)}</td><td>{num(g.unknownBytes)}</td></tr>)}</tbody></table></div> : <NeedOnline state={state}><p class="hint">Bấm Audit KV để xem phân bổ key/byte theo prefix.</p></NeedOnline>}
      <div class="savebar"><button class="btn pri" type="button" disabled={!state.online} onClick={onRecount}>Đếm lại số chương từ KV</button></div>
    </section>
  </div>;
}

export function CommentsPanel({ state, onLoad, onDelete }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [slug, setSlug] = useState('');
  const data = state.comments || {};
  const rows = useMemo(() => {
    const query = q.toLowerCase();
    return (data.items || []).filter((c) => (!slug || c.slug === slug) && (!query || (String(c.text || '') + ' ' + String(c.name || '') + ' ' + String(c.slug || '')).toLowerCase().includes(query)));
  }, [data.items, q, slug]);
  const load = async () => { setBusy(true); setError(''); try { await onLoad(); } catch (e) { setError(e.message || String(e)); } finally { setBusy(false); } };
  useEffect(() => { if (state.online && !data.loaded && !busy) load(); }, [state.online]);
  return <div id="pane-cmts" class="v2pane"><section class="card2">
    <div class="row"><h3>Bình luận</h3><span class="grow"></span><LoaderButton busy={busy} onClick={load}>Đọc bình luận</LoaderButton></div>
    <NeedOnline state={state}><p class="hint">Đang có {num(data.count != null ? data.count : (data.items || []).length)} bình luận trong bộ nhớ admin v2.{data.fallback ? ' Worker cũ nên đang gom từng bộ.' : ''}</p></NeedOnline>
    {error ? <div class="msgbar show err">{error}</div> : null}
    <div class="row v2filters"><input class="inp" placeholder="Tìm nội dung/người gửi/slug" value={q} onInput={(e) => setQ(e.currentTarget.value)} /><select class="inp" value={slug} onChange={(e) => setSlug(e.currentTarget.value)}><option value="">Mọi bộ</option>{((state.registry && state.registry.lib) || []).map((b) => <option value={b.slug}>{b.title}</option>)}</select></div>
    <div class="v2listcards">{rows.length ? rows.slice(0, 400).map((c) => <article class="v2itemrow">
      <div><b>{c.name || 'Bạn đọc'}</b><span class="sm muted"> · {dateText(c.createdAt)} · <StoryLink registry={state.registry} slug={c.slug} /> {c.ch ? <span class="pill acc">chương {c.ch}</span> : null}</span><p>{c.text}</p></div>
      <button class="btn ghost sm danger" type="button" onClick={() => onDelete(c.slug, c.id)}>Xoá</button>
    </article>) : <div class="empty sm">Chưa có bình luận nào khớp.</div>}</div>
  </section></div>;
}

export function ReportsPanel({ state, onLoad }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const data = state.reports || {};
  const rows = useMemo(() => {
    const query = q.toLowerCase();
    return (data.items || []).filter((r) => !query || (String(r.text || '') + ' ' + String(r.title || '') + ' ' + String(r.slug || '')).toLowerCase().includes(query));
  }, [data.items, q]);
  const load = async () => { setBusy(true); setError(''); try { await onLoad(q); } catch (e) { setError(e.message || String(e)); } finally { setBusy(false); } };
  useEffect(() => { if (state.online && !data.loaded && !busy) load(); }, [state.online]);
  return <div id="pane-reports" class="v2pane"><section class="card2">
    <div class="row"><h3>Báo lỗi</h3><span class="grow"></span><LoaderButton busy={busy} onClick={load}>Đọc báo lỗi</LoaderButton></div>
    <NeedOnline state={state}><p class="hint">Endpoint hiện chỉ có danh sách đọc; chưa có PATCH id/status nên admin v2 không tự thêm trạng thái xử lý.</p></NeedOnline>
    {error ? <div class="msgbar show err">{error}</div> : null}
    <div class="row v2filters"><input class="inp" placeholder="Tìm báo lỗi" value={q} onInput={(e) => setQ(e.currentTarget.value)} /><button class="btn ghost sm" type="button" onClick={load}>Tìm</button></div>
    <div class="v2listcards">{rows.length ? rows.slice(0, 300).map((r) => <article class="v2itemrow">
      <div><b>{r.kind || 'Báo lỗi'}</b><span class="sm muted"> · {dateText(r.at)} · <StoryLink registry={state.registry} slug={r.slug} /> {r.ch ? <span class="pill acc">chương {r.ch}</span> : null}</span><p>{r.text}</p>{r.url ? <a class="btn ghost sm" href={r.url} target="_blank" rel="noreferrer">Mở vị trí ↗</a> : null}{r.image ? <a class="btn ghost sm" href={apiAsset(state, r.image)} target="_blank" rel="noreferrer">Ảnh đính kèm ↗</a> : null}</div>
    </article>) : <div class="empty sm">Chưa có báo lỗi nào khớp.</div>}</div>
  </section></div>;
}

export function StatsPanel({ state, onLoad }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState(null);
  const load = async () => { setBusy(true); setError(''); try { setStats(await onLoad()); } catch (e) { setError(e.message || String(e)); } finally { setBusy(false); } };
  useEffect(() => { if (state.online && !stats && !busy) load(); }, [state.online]);
  const top = useMemo(() => Object.entries((stats && stats.items) || {}).map(([slug, it]) => Object.assign({ slug }, it)).sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 40), [stats]);
  const totalViews = top.reduce((a, it) => a + (Number(it.views) || 0), 0);
  const totalVotes = top.reduce((a, it) => a + (Number(it.votes) || 0), 0);
  return <div id="pane-stats" class="v2pane"><section class="card2">
    <div class="row"><h3>Thống kê</h3><span class="grow"></span><LoaderButton busy={busy} onClick={load}>Đọc thống kê KV</LoaderButton></div>
    <NeedOnline state={state}><p class="hint">Thống kê chi tiết nằm trong KV; tab này không ghi dữ liệu.</p></NeedOnline>
    {error ? <div class="msgbar show err">{error}</div> : null}
    <div class="tiles v2tiles4"><div class="tile"><b>{num(top.length)}</b><span>bộ có số liệu</span></div><div class="tile"><b>{num(totalViews)}</b><span>lượt đọc trong top</span></div><div class="tile"><b>{num(totalVotes)}</b><span>phiếu trong top</span></div><div class="tile"><b>{num((stats && stats.days && stats.days.length) || 0)}</b><span>ngày có chuỗi</span></div></div>
    <div class="v2table-wrap"><table class="tbl v2book-table"><thead><tr><th>Bộ</th><th>Views</th><th>Votes</th><th>Voters</th><th>Hôm nay</th></tr></thead><tbody>{top.map((it) => <tr><td><StoryLink registry={state.registry} slug={it.slug} /></td><td>{num(it.views)}</td><td>{num(it.votes)}</td><td>{num(it.voters)}</td><td>{num(it.viewsToday)} đọc · {num(it.votesToday)} phiếu</td></tr>)}</tbody></table>{!top.length ? <div class="empty sm">Chưa có dữ liệu thống kê trong phiên này.</div> : null}</div>
  </section></div>;
}

export function VotesPanel({ state, onLoadVoters, onRemoveVotes, onResetVotes }) {
  const lib = (state.registry && state.registry.lib) || [];
  const [slug, setSlug] = useState((lib[0] && lib[0].slug) || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState({});
  const [resetCh, setResetCh] = useState('');
  const load = async (s = slug) => { if (!s) return; setBusy(true); setError(''); setSelected({}); try { setData(await onLoadVoters(s)); } catch (e) { setError(e.message || String(e)); } finally { setBusy(false); } };
  const voters = [];
  if (data && data.book && data.book.voters) data.book.voters.forEach((v) => voters.push(v));
  Object.keys((data && data.chapters) || {}).forEach((ch) => ((data.chapters[ch] && data.chapters[ch].voters) || []).forEach((v) => voters.push(v)));
  const keys = Object.keys(selected).filter((k) => selected[k]);
  const toggle = (key) => setSelected((prev) => Object.assign({}, prev, { [key]: !prev[key] }));
  const remove = async () => { setError(''); try { await onRemoveVotes(slug, keys); await load(slug); } catch (e) { setError(e.message || String(e)); } };
  return <div id="pane-votes" class="v2pane"><section class="card2">
    <div class="row"><h3>Phiếu bầu</h3><span class="grow"></span><LoaderButton busy={busy} onClick={() => load()}>Đọc phiếu</LoaderButton></div>
    <NeedOnline state={state}><p class="hint">Gỡ/reset phiếu là thao tác ghi KV, admin v2 tính quota ước lượng và hỏi xác nhận mạnh.</p></NeedOnline>
    {error ? <div class="msgbar show err">{error}</div> : null}
    <div class="row v2filters"><select class="inp" value={slug} onChange={(e) => { setSlug(e.currentTarget.value); setData(null); }}><option value="">Chọn bộ</option>{lib.map((b) => <option value={b.slug}>{b.title}</option>)}</select><button class="btn ghost sm" type="button" onClick={() => load()}>Xem</button></div>
    {data ? <div class="tiles v2tiles4"><div class="tile"><b>{num(data.total)}</b><span>phiếu đang hiện</span></div><div class="tile"><b>{num(data.voters)}</b><span>khóa người bầu</span></div><div class="tile"><b>{num(data.counted)}</b><span>đếm mới</span></div><div class="tile"><b>{num(data.base)}</b><span>số cũ import</span></div></div> : null}
    <div class="v2listcards">{voters.length ? voters.slice(0, 600).map((v) => <label class="v2itemrow v2checkrow"><input type="checkbox" checked={!!selected[v.key]} onChange={() => toggle(v.key)} /><div><b>{v.kindLabel || v.kind || 'người bầu'}</b><span class="sm muted"> · {v.ch ? 'chương ' + v.ch : 'cả bộ'} · {dateText(v.at)}</span><code>{v.id || v.key}</code></div></label>) : <div class="empty sm">Chưa đọc hoặc bộ này chưa có phiếu khóa người bầu.</div>}</div>
    <div class="savebar"><span class="sm muted">{num(keys.length)} phiếu được chọn</span><button class="btn ghost danger" type="button" disabled={!keys.length} onClick={remove}>Gỡ phiếu đã chọn</button><span class="grow"></span><input class="inp sm" style="max-width:130px" placeholder="chương?" value={resetCh} onInput={(e) => setResetCh(e.currentTarget.value)} /><button class="btn ghost danger" type="button" disabled={!slug} onClick={() => onResetVotes({ slug, ch: resetCh ? Number(resetCh) : undefined })}>Reset phiếu bộ này</button></div>
  </section></div>;
}

export function LogPanel({ state, onLoad }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const load = async () => { setBusy(true); setError(''); try { const r = await onLoad(); setItems((r && r.items) || []); } catch (e) { setError(e.message || String(e)); } finally { setBusy(false); } };
  useEffect(() => { if (state.online && !items.length && !busy) load(); }, [state.online]);
  return <div id="pane-log" class="v2pane"><section class="card2">
    <div class="row"><h3>Nhật ký</h3><span class="grow"></span><LoaderButton busy={busy} onClick={load}>Đọc log</LoaderButton></div>
    <NeedOnline state={state}><p class="hint">Hiển thị tối đa 200 thao tác gần nhất từ key <code>log</code>.</p></NeedOnline>
    {error ? <div class="msgbar show err">{error}</div> : null}
    <div class="v2listcards">{items.length ? items.map((it) => <article class="v2itemrow"><div><b>{it.text}</b><span class="sm muted"> · {dateText(it.at)} · {it.who || 'admin-key'}</span></div></article>) : <div class="empty sm">Chưa có log trong phiên này.</div>}</div>
  </section></div>;
}

export function SettingsPanel({ state, onReload, onRecount, onStatsRefresh, onImportBlogger, onSyncBlogger, onDownloadBackup }) {
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
  return <div id="pane-settings" class="v2pane"><section class="card2">
    <h3>Cài đặt & thao tác hệ thống</h3>
    <p class="hint">Admin v2 giữ static Cloudflare Pages, không thêm dịch vụ trả phí và không đưa secret vào bundle. Các nút ghi KV đều đi qua endpoint Worker có sẵn.</p>
    <div class="v2ops-grid"><div class="v2mini"><b>Kết nối</b><p class="hint">Chế độ: {state.online ? 'Worker + ADMIN_KEY' : 'dữ liệu tĩnh/login frontend'}</p><p class="hint">API: <code>{state.apiBase || (window.CZ && window.CZ.API) || '—'}</code></p></div><div class="v2mini"><b>Quota ghi KV</b><p class="hint">Counter hiện tại: {num(state.quota && state.quota.writesToday)}/{num(state.quota && state.quota.limit || 1000)} · nguồn {state.quota && state.quota.source}</p></div></div>
    <div class="v2ops-grid">
      <div class="v2mini">
        <b>Backup một file</b>
        <p class="hint">Tải registry + book JSON hiện có. Mặc định strip lock hash để file backup an toàn hơn khi dùng cho repo.</p>
        <button class="btn ghost sm" type="button" disabled={!!busy} onClick={() => run('backup', onDownloadBackup)}>Tải backup JSON</button>
      </div>
      <div class="v2mini">
        <b>Nhập chương từ Blogger</b>
        <p class="hint">Tự tìm bài khớp tên truyện, hoặc dán link blogspot cụ thể. Ghi book + registry, không đổi schema.</p>
        <label class="fl">Bộ truyện</label><select class="inp" value={slug} onChange={(e) => setSlug(e.currentTarget.value)}>{lib.map((book) => <option value={book.slug}>{book.title}</option>)}</select>
        <label class="fl">URL bài viết Blogspot (không bắt buộc)</label><input class="inp" value={url} onInput={(e) => setUrl(e.currentTarget.value)} placeholder="https://chuseoz.blogspot.com/..." />
        <label class="fl">Cách nhập</label><select class="inp" value={mode} onChange={(e) => setMode(e.currentTarget.value)}><option value="append">Thêm vào cuối</option><option value="replace-last">Thay chương cuối</option></select>
        <button class="btn pri sm mt" type="button" disabled={!state.online || !!busy || !slug} onClick={() => run('import', () => onImportBlogger({ slug, url, mode }))}>{busy === 'import' ? 'Đang nhập…' : 'Nhập chương'}</button>
      </div>
      <div class="v2mini">
        <b>Đồng bộ metadata Blogger</b>
        <p class="hint">Đọc list-novel + lịch ra chương rồi cập nhật registry KV; số chương thật trong KV vẫn là nguồn thắng.</p>
        <button class="btn ghost sm" type="button" disabled={!state.online || !!busy} onClick={() => run('sync', onSyncBlogger)}>{busy === 'sync' ? 'Đang đồng bộ…' : 'Đồng bộ Blogger'}</button>
      </div>
    </div>
    {result ? <pre class="v2result">{result}</pre> : null}
    <div class="savebar"><button class="btn ghost" type="button" onClick={onReload}>Đọc lại dữ liệu</button><button class="btn ghost" type="button" disabled={!state.online || !!busy} onClick={() => run('stats', onStatsRefresh)}>Flush stats cache</button><button class="btn pri" type="button" disabled={!state.online || !!busy} onClick={() => run('recount', onRecount)}>Đếm lại số chương</button><a class="btn ghost" href="/admin-legacy">Mở admin cũ</a></div>
  </section></div>;
}
