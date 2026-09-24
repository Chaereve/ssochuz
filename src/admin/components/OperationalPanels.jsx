import { h } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { pct } from '../utils/format.js';
import { spamSuspects } from '../utils/overview.js';

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

export function DoctorPanel({ state, onKvAudit, onScanBooks, onRecount, onReload, onFix, onMigrate }) {
  const [busy, setBusy] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [fixBusy, setFixBusy] = useState('');
  const [audit, setAudit] = useState(null);
  const [scan, setScan] = useState(null);
  const [error, setError] = useState('');
  const [migBusy, setMigBusy] = useState('');
  const [migrate, setMigrate] = useState(null);
  const [migError, setMigError] = useState('');
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
  const runFix = async (row) => {
    if (!onFix || !row) return;
    setFixBusy(row.slug + row.issue); setError('');
    try {
      await onFix(row);
      setScan(await onScanBooks());
    } catch (e) { setError(e.message || String(e)); }
    finally { setFixBusy(''); }
  };
  /* chuyển data cũ (book đầy đủ + ảnh base64) sang overflow: bìa → Supabase
     Storage `covers`, book/ảnh chương → bảng ssochuz_blobs/R2. Worker xử lý
     theo lô, panel gọi lặp và vẽ tiến độ từng vòng. */
  const runMigrate = async (only) => {
    if (!onMigrate || migBusy) return;
    const label = only === 'books' ? 'chỉ book' : (only === 'covers' ? 'chỉ bìa' : 'book + bìa + ảnh chương');
    const ok = window.confirm('Chuyển ' + label + ' trong KV sang Supabase/R2?\n\nKV chỉ còn stub nhỏ; dữ liệu đầy đủ nằm ở Supabase/R2. Có thể mất vài phút nếu kho lớn.');
    if (!ok) return;
    setMigBusy(only || 'all'); setMigError(''); setMigrate(null);
    try {
      const totals = await onMigrate({
        only,
        onProgress: (t) => setMigrate(Object.assign({ running: true }, t)),
      });
      setMigrate(totals);
    } catch (e) { setMigError(e.message || String(e)); }
    finally { setMigBusy(''); }
  };
  const ov = (state.worker && state.worker.overflow) || {};
  const wst = (state.worker && state.worker.stats) || {};
  useEffect(() => { if (state.online && !audit && !busy) load(); }, [state.online]);
  return <div id="pane-doctor" class="v2pane">
    <section class="card2">
      <div class="row"><h3>Kiểm tra dữ liệu</h3><span class="grow"></span><button class="btn ghost sm" type="button" onClick={onReload}>Đọc lại registry</button><button class="btn ghost sm" type="button" disabled={scanBusy} onClick={runScan}>{scanBusy ? 'Đang quét…' : 'Quét book'}</button><LoaderButton busy={busy} onClick={load}>Audit KV</LoaderButton></div>
      <p class="hint">Chạy hoàn toàn trên dữ liệu hiện có; không đổi schema. “Quét book” liệt kê lỗi; bấm Sửa trên từng dòng để ghi (tạo book thiếu / khớp số chương). “Đếm lại” quét cả kho.</p>
      <div class="tiles v2tiles4">
        <div class="tile"><b>{num(lib.length)}</b><span>bộ trong registry</span></div>
        <div class="tile"><b>{num(issues.dup.length)}</b><span>slug trùng/thiếu</span></div>
        <div class="tile"><b>{num(issues.missingCover.length)}</b><span>thiếu bìa</span></div>
        <div class="tile"><b>{num(issues.missingSynopsis.length)}</b><span>thiếu mô tả</span></div>
      </div>
      {error ? <div class="msgbar show err">{error}<div class="v2err-actions"><button class="btn ghost sm" type="button" onClick={runScan}>Thử quét lại</button></div></div> : null}
      {(migrate || migError) ? (
        <div class={'msgbar show ' + (migError ? 'err' : (migrate && migrate.done && !(migrate.failed || []).length ? 'ok' : 'info'))} role="status">
          {migError ? ('Chuyển overflow lỗi: ' + migError) : null}
          {!migError && migrate ? (
            <span>
              Đã chuyển: {num(migrate.books)} book · {num(migrate.covers)} bìa · {num(migrate.images)} ảnh chương
              {migrate.already ? ' · bỏ qua ' + num(migrate.already) + ' mục đã ở overflow' : ''}
              {migrate.running ? (' — đang chạy vòng ' + num(migrate.rounds) + '…')
                : (migrate.done ? ' — xong, KV chỉ còn stub. Tải lại trang truyện là thấy bìa mới từ Supabase.' : ' — tạm dừng giữa chừng (giới hạn vòng), bấm chạy lại để tiếp tục.')}
              {migrate.failed && migrate.failed.length ? (' · ' + migrate.failed.length + ' mục lỗi (giữ nguyên trong KV): ' + migrate.failed.slice(0, 3).map((f) => f.key).join(', ') + (migrate.failed.length > 3 ? '…' : '')) : ''}
            </span>
          ) : null}
        </div>
      ) : null}
      <div class="v2ops-grid">
        <div class="v2mini"><b>Registry quick check</b><p class="hint">Slug trùng: {issues.dup.slice(0, 6).join(', ') || 'không thấy'}</p><p class="hint">Thiếu tên: {issues.missingTitle.slice(0, 6).join(', ') || 'không thấy'}</p></div>
        <div class="v2mini"><b>KV write quota</b>
          {/* Số THẬT của Worker (từ /api/health, bản 1.16.0): khoá `stats` là chỗ
              tiêu hạn mức ghi nhiều nhất — trước đây ghi mỗi 10 giây = 8.640
              lượt/ngày, nay theo ngân sách ngày. Không polling: chỉ đọc lúc nối/
              đọc lại, đúng lúc mở tab. */}
          <p class="hint">Khoá số liệu (stats) hôm nay: <b>{num(wst.writesToday)}/{num(wst.writeBudget || 240)}</b> lượt ghi{typeof wst.buffered === 'number' ? ' · đang đệm ' + num(wst.buffered) + ' thay đổi' : ''}.</p>
          <span class="kvbar"><span style={{ width: pct(wst.writesToday, wst.writeBudget || 240) + '%' }}></span></span>
          <p class="hint">Thao tác quản trị hôm nay (theo nhật ký KV): {num(state.quota && state.quota.writesToday)}/{num(state.quota && state.quota.limit || 1000)} lượt ({state.quota && state.quota.source}).</p>
        </div>
        <div class="v2mini"><b>Overflow KV</b><p class="hint">Supabase: {ov.supabase ? 'connected' : 'unavailable'}. R2: {ov.r2 ? 'connected' : 'unavailable'}. Bìa: {ov.covers ? 'Supabase Storage (1 GB free)' : 'KV'}. Ảnh chương: {(ov.supabase || ov.r2) ? 'overflow sang Supabase/R2, ghi lỗi thì rớt về KV' : 'KV'}. Chưa gắn thì book/img vẫn nằm full trong KV — không giả lưu.</p>
          {(ov.supabase || ov.r2) && onMigrate ? (
            <div class="v2mig">
              <p class="hint"><b>Data cũ còn trong KV?</b> Chuyển 1 lần sang Supabase/R2 ngay tại đây (bìa → Storage <code>covers</code>, book/ảnh chương → <code>ssochuz_blobs</code>/R2, KV chỉ còn stub):</p>
              <div class="row">
                <button class="btn ghost sm" type="button" disabled={!state.online || !!migBusy} onClick={() => runMigrate('')}>{migBusy ? 'Đang chuyển…' : 'Chuyển tất cả'}</button>
                <button class="btn ghost sm" type="button" disabled={!state.online || !!migBusy} onClick={() => runMigrate('covers')}>Chỉ bìa</button>
                <button class="btn ghost sm" type="button" disabled={!state.online || !!migBusy} onClick={() => runMigrate('books')}>Chỉ book</button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {scan ? <div class="v2doctor-scan">
        <div class="tiles v2tiles4"><div class="tile"><b>{num(scan.scanned)}</b><span>book đã quét ({scan.source})</span></div><div class="tile"><b>{num(scan.missing)}</b><span>thiếu book</span></div><div class="tile"><b>{num(scan.mismatch)}</b><span>lệch số chương</span></div><div class="tile"><b>{num(scan.empty)}</b><span>chương rỗng</span></div></div>
        {scan.rows && scan.rows.length ? <div class="v2table-wrap"><table class="tbl v2book-table"><thead><tr><th>Bộ</th><th>Vấn đề</th><th>Registry</th><th>Book</th><th></th></tr></thead><tbody>{scan.rows.map((row) => <tr key={row.slug + row.issue}><td data-lb="Bộ"><StoryLink registry={state.registry} slug={row.slug} /></td><td data-lb="Vấn đề">{row.issue}</td><td data-lb="Registry">{row.registry == null ? '—' : num(row.registry)}</td><td data-lb="Book">{row.actual == null ? '—' : num(row.actual)}</td><td data-lb="Thao tác">{onFix ? <button class="btn ghost sm" type="button" disabled={!!fixBusy} onClick={() => runFix(row)}>{fixBusy === row.slug + row.issue ? 'Đang sửa…' : 'Sửa'}</button> : null}</td></tr>)}</tbody></table></div> : <div class="msgbar show ok">Quét xong, chưa thấy lệch lớn trong book.</div>}
      </div> : null}
      {audit ? <div class="v2table-wrap"><table class="tbl v2book-table"><thead><tr><th>Prefix</th><th>Keys</th><th>Bytes biết được</th><th>Không metadata</th></tr></thead><tbody>{(audit.groups || []).map((g) => <tr key={g.prefix}><td data-lb="Prefix"><b>{g.prefix}</b></td><td data-lb="Keys">{num(g.keys)}</td><td data-lb="Bytes">{num(g.bytes)}</td><td data-lb="Không metadata">{num(g.unknownBytes)}</td></tr>)}</tbody></table></div> : <NeedOnline state={state}><p class="hint">Bấm Audit KV để xem phân bổ key/byte theo prefix.</p></NeedOnline>}
      <div class="savebar"><button class="btn pri" type="button" disabled={!state.online || (state.quota && state.quota.writesToday >= (state.quota.limit || 1000))} onClick={onRecount}>Đếm lại số chương từ KV</button></div>
    </section>
  </div>;
}

export function CommentsPanel({ state, onLoad, onDelete }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [slug, setSlug] = useState('');
  const [onlySpam, setOnlySpam] = useState(false);
  const data = state.comments || {};
  const spamKeys = useMemo(() => {
    const set = {};
    spamSuspects(data).forEach((c) => { set[c.slug + ':' + c.id] = 1; });
    return set;
  }, [data]);
  const rows = useMemo(() => {
    const query = q.toLowerCase();
    return (data.items || []).filter((c) => (!slug || c.slug === slug)
      && (!onlySpam || spamKeys[c.slug + ':' + c.id])
      && (!query || (String(c.text || '') + ' ' + String(c.name || '') + ' ' + String(c.slug || '')).toLowerCase().includes(query)));
  }, [data.items, q, slug, onlySpam, spamKeys]);
  const load = async () => { setBusy(true); setError(''); try { await onLoad(); } catch (e) { setError(e.message || String(e)); } finally { setBusy(false); } };
  useEffect(() => { if (state.online && !data.loaded && !busy) load(); }, [state.online]);
  return <div id="pane-cmts" class="v2pane"><section class="card2">
    <div class="row"><h3>Bình luận</h3><span class="grow"></span><LoaderButton busy={busy} onClick={load}>Đọc bình luận</LoaderButton></div>
    <NeedOnline state={state}><p class="hint">Đang có {num(data.count != null ? data.count : (data.items || []).length)} bình luận trong bộ nhớ admin.{data.fallback ? ' Worker cũ nên đang gom từng bộ.' : ''}</p></NeedOnline>
    {error ? <div class="msgbar show err">{error}<div class="v2err-actions"><button class="btn ghost sm" type="button" onClick={load}>Thử lại</button></div></div> : null}
    <div class="row v2filters"><input class="inp" aria-label="Tìm bình luận" placeholder="Tìm nội dung/người gửi/slug" value={q} onInput={(e) => setQ(e.currentTarget.value)} /><select class="inp" value={slug} onChange={(e) => setSlug(e.currentTarget.value)}><option value="">Mọi bộ</option>{((state.registry && state.registry.lib) || []).map((b) => <option key={b.slug} value={b.slug}>{b.title}</option>)}</select><button type="button" class={`btn ghost sm ${onlySpam ? 'v2tab-on' : ''}`} onClick={() => setOnlySpam(!onlySpam)}>Chỉ nghi spam ({spamSuspects(data).length})</button></div>
    <div class="v2listcards">{rows.length ? rows.slice(0, 400).map((c) => <article class="v2itemrow" key={c.slug + ':' + c.id}>
      <div><b>{c.name || 'Bạn đọc'}</b><span class="sm muted"> · {dateText(c.createdAt)} · <StoryLink registry={state.registry} slug={c.slug} /> {c.ch ? <span class="pill acc">chương {c.ch}</span> : null}</span><p>{c.text}</p></div>
      <button class="btn ghost sm danger" type="button" onClick={() => onDelete(c.slug, c.id)}>Xoá</button>
    </article>) : <div class="empty sm">Chưa có bình luận nào khớp.</div>}</div>
  </section></div>;
}

export function ReportsPanel({ state, onLoad, onMark }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [scope, setScope] = useState('all');
  const data = state.reports || {};
  const rows = useMemo(() => {
    const query = q.toLowerCase();
    return (data.items || []).filter((r) => (scope === 'all' || (scope === 'open' ? !r.done : !!r.done))
      && (!query || (String(r.text || '') + ' ' + String(r.title || '') + ' ' + String(r.slug || '')).toLowerCase().includes(query)));
  }, [data.items, q, scope]);
  const openCount = (data.items || []).filter((x) => !x.done).length;
  const mark = async (r) => {
    setError('');
    try { await onMark(r.id, !r.done); } catch (e) { setError(e.message || String(e)); }
  };
  const load = async () => { setBusy(true); setError(''); try { await onLoad(q); } catch (e) { setError(e.message || String(e)); } finally { setBusy(false); } };
  useEffect(() => { if (state.online && !data.loaded && !busy) load(); }, [state.online]);
  return <div id="pane-reports" class="v2pane"><section class="card2">
    <div class="row"><h3>Báo lỗi</h3><span class="grow"></span><LoaderButton busy={busy} onClick={load}>Đọc báo lỗi</LoaderButton></div>
    <NeedOnline state={state}><p class="hint">Bấm “Xử lý xong” để ghi trạng thái vào KV (PATCH /api/admin/reports); Tổng quan đếm “Báo lỗi chưa xử lý” theo số chưa xử lý.</p></NeedOnline>
    {error ? <div class="msgbar show err">{error}<div class="v2err-actions"><button class="btn ghost sm" type="button" onClick={load}>Thử lại</button></div></div> : null}
    <div class="row v2filters">
      <input class="inp" aria-label="Tìm báo lỗi" placeholder="Tìm báo lỗi" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
      <button class="btn ghost sm" type="button" onClick={load}>Tìm</button>
      <span class="v2reptabs">
        <button type="button" class={scope === 'all' ? 'v2tab-on' : ''} onClick={() => setScope('all')}>Tất cả ({num(data.count)})</button>
        <button type="button" class={scope === 'open' ? 'v2tab-on' : ''} onClick={() => setScope('open')}>Chưa xử lý ({num(openCount)})</button>
        <button type="button" class={scope === 'done' ? 'v2tab-on' : ''} onClick={() => setScope('done')}>Đã xử lý</button>
      </span>
    </div>
    <div class="v2listcards">{rows.length ? rows.slice(0, 300).map((r) => <article class={`v2itemrow ${r.done ? 'v2done' : ''}`} key={(r.id || '') + ':' + r.slug + ':' + String(r.at)}>
      <div><b>{r.kind || 'Báo lỗi'}</b>{r.done ? <span class="pill v2donepill">đã xử lý</span> : null}<span class="sm muted"> · {dateText(r.at)} · <StoryLink registry={state.registry} slug={r.slug} /> {r.ch ? <span class="pill acc">chương {r.ch}</span> : null}</span><p>{r.text}</p>{r.url ? <a class="btn ghost sm" href={r.url} target="_blank" rel="noreferrer">Mở vị trí ↗</a> : null}{r.image ? <a class="btn ghost sm" href={apiAsset(state, r.image)} target="_blank" rel="noreferrer">Ảnh đính kèm ↗</a> : null}</div>
      <button class={`btn ghost sm ${r.done ? '' : 'v2okbtn'}`} type="button" disabled={!r.id || !onMark} onClick={() => mark(r)}>{r.done ? 'Mở lại' : 'Xử lý xong'}</button>
    </article>) : <div class="empty sm">Chưa có báo lỗi nào khớp.</div>}</div>
  </section></div>;
}

/* Biểu đồ cột dùng chung (Overview + Stats) */
export function BarsChart({ days, take = 30 }) {
  const last = (days || []).slice(-take);
  const maxV = Math.max(1, ...last.map((d) => Number(d.views) || 0));
  if (!last.length) return <p class="hint">Chưa có chuỗi ngày nào.</p>;
  return (
    <div class="v2chart v2chart-lg" role="img" aria-label="Biểu đồ lượt đọc theo ngày">
      {last.map((d) => (
        <div class="v2chart-col" key={d.day} title={d.day + ' · ' + (Number(d.views) || 0) + ' đọc · ' + (Number(d.votes) || 0) + ' phiếu'}>
          <span class="v2chart-bar" style={{ height: Math.round((Number(d.views) || 0) / maxV * 100) + '%' }}></span>
          <span class="v2chart-dot" style={{ height: Math.max(4, Math.round((Number(d.votes) || 0) / maxV * 100)) + 'px' }}></span>
          <i>{d.day.slice(5)}</i>
        </div>
      ))}
    </div>
  );
}

export function StatsPanel({ state, onLoad }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState(null);
  const [chapSlug, setChapSlug] = useState('');
  const load = async () => { setBusy(true); setError(''); try { setStats(await onLoad()); } catch (e) { setError(e.message || String(e)); } finally { setBusy(false); } };
  useEffect(() => { if (state.online && !stats && !busy) load(); }, [state.online]);
  const top = useMemo(() => Object.entries((stats && stats.items) || {}).map(([slug, it]) => Object.assign({ slug }, it)).sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 40), [stats]);
  const totalViews = top.reduce((a, it) => a + (Number(it.views) || 0), 0);
  const totalVotes = top.reduce((a, it) => a + (Number(it.votes) || 0), 0);
  const lib = (state.registry && state.registry.lib) || [];
  const pick = chapSlug || (top[0] && top[0].slug) || '';
  const chapRows = useMemo(() => {
    const it = ((stats && stats.items) || {})[pick];
    if (!it || !it.chapVotes) return [];
    return Object.entries(it.chapVotes)
      .map(([ch, c]) => ({ ch: Number(ch) || 0, count: (c && (c.o != null ? c.o : c.votes)) || (typeof c === 'number' ? c : 0) }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [stats, pick]);
  const titleOf = (slug) => { const b = lib.find((x) => x.slug === slug); return (b && b.title) || slug; };
  return <div id="pane-stats" class="v2pane"><section class="card2">
    <div class="row"><h3>Thống kê</h3><span class="grow"></span><LoaderButton busy={busy} onClick={load}>Đọc thống kê KV</LoaderButton></div>
    <NeedOnline state={state}><p class="hint">Thống kê chi tiết nằm trong KV; tab này không ghi dữ liệu.</p></NeedOnline>
    {error ? <div class="msgbar show err">{error}<div class="v2err-actions"><button class="btn ghost sm" type="button" onClick={load}>Thử lại</button></div></div> : null}
    <div class="tiles v2tiles4"><div class="tile"><b>{num(top.length)}</b><span>bộ có số liệu</span></div><div class="tile"><b>{num(totalViews)}</b><span>lượt đọc trong top</span></div><div class="tile"><b>{num(totalVotes)}</b><span>phiếu trong top</span></div><div class="tile"><b>{num((stats && stats.days && stats.days.length) || 0)}</b><span>ngày có chuỗi</span></div></div>
    <div class="row"><h3>Lượt đọc 30 ngày</h3></div>
    <BarsChart days={(stats && stats.days) || []} />
    <div class="v2table-wrap"><table class="tbl v2book-table"><thead><tr><th>Bộ</th><th>Views</th><th>Votes</th><th>Voters</th><th>Hôm nay</th></tr></thead><tbody>{top.map((it) => <tr key={it.slug}><td data-lb="Bộ"><StoryLink registry={state.registry} slug={it.slug} /></td><td data-lb="Views">{num(it.views)}</td><td data-lb="Votes">{num(it.votes)}</td><td data-lb="Voters">{num(it.voters)}</td><td data-lb="Hôm nay">{num(it.viewsToday)} đọc · {num(it.votesToday)} phiếu</td></tr>)}</tbody></table>{!top.length ? <div class="empty sm">Chưa có dữ liệu thống kê trong phiên này.</div> : null}</div>
    {top.length ? <div>
      <div class="row"><h3>Phiếu theo chương</h3><span class="grow"></span><select class="sel" value={pick} onChange={(e) => setChapSlug(e.currentTarget.value)}>{top.map((it) => <option key={it.slug} value={it.slug}>{titleOf(it.slug)}</option>)}</select></div>
      {chapRows.length ? <div class="v2table-wrap"><table class="tbl v2book-table"><thead><tr><th>Chương</th><th>Phiếu</th></tr></thead><tbody>{chapRows.map((x) => <tr key={x.ch}><td data-lb="Chương">Chương {num(x.ch)}</td><td data-lb="Phiếu">{num(x.count)}</td></tr>)}</tbody></table></div> : <p class="hint">Bộ này chưa có phiếu khóa theo chương nào.</p>}
    </div> : null}
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
    <NeedOnline state={state}><p class="hint">Gỡ/reset phiếu là thao tác ghi KV, admin tính quota ước lượng và hỏi xác nhận mạnh.</p></NeedOnline>
    {error ? <div class="msgbar show err">{error}<div class="v2err-actions"><button class="btn ghost sm" type="button" onClick={() => load()}>Thử lại</button></div></div> : null}
    <div class="row v2filters"><select class="inp" aria-label="Chọn bộ truyện" value={slug} onChange={(e) => { setSlug(e.currentTarget.value); setData(null); }}><option value="">Chọn bộ</option>{lib.map((b) => <option key={b.slug} value={b.slug}>{b.title}</option>)}</select><button class="btn ghost sm" type="button" onClick={() => load()}>Xem</button></div>
    {data ? <div class="tiles v2tiles4"><div class="tile"><b>{num(data.total)}</b><span>phiếu đang hiện</span></div><div class="tile"><b>{num(data.voters)}</b><span>khóa người bầu</span></div><div class="tile"><b>{num(data.counted)}</b><span>đếm mới</span></div><div class="tile"><b>{num(data.base)}</b><span>số cũ import</span></div></div> : null}
    <div class="v2listcards">{voters.length ? voters.slice(0, 600).map((v) => <label class="v2itemrow v2checkrow" key={v.key}><input type="checkbox" checked={!!selected[v.key]} onChange={() => toggle(v.key)} /><div><b>{v.kindLabel || v.kind || 'người bầu'}</b><span class="sm muted"> · {v.ch ? 'chương ' + v.ch : 'cả bộ'} · {dateText(v.at)}</span><code>{v.id || v.key}</code></div></label>) : <div class="empty sm">Chưa đọc hoặc bộ này chưa có phiếu khóa người bầu.</div>}</div>
    <div class="savebar"><span class="sm muted">{num(keys.length)} phiếu được chọn</span><button class="btn ghost danger" type="button" disabled={!keys.length} onClick={remove}>Gỡ phiếu đã chọn</button><span class="grow"></span><input class="inp sm" style="max-width:130px" placeholder="chương?" value={resetCh} onInput={(e) => setResetCh(e.currentTarget.value)} /><button class="btn ghost danger" type="button" disabled={!slug} onClick={() => onResetVotes({ slug, ch: /^\d+$/.test(resetCh.trim()) ? Number(resetCh.trim()) : undefined })}>Reset phiếu bộ này</button></div>
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
    {error ? <div class="msgbar show err">{error}<div class="v2err-actions"><button class="btn ghost sm" type="button" onClick={load}>Thử lại</button></div></div> : null}
    {(() => {
      const session = (state.audit || []).slice(0, 200);
      const merged = items.length ? items.slice(0, 200) : session;
      return <div class="v2listcards">{merged.length ? merged.map((it, i) => <article class="v2itemrow" key={(it.at || '') + i}><div><b>{it.text || it.action}</b><span class="sm muted"> · {dateText(it.at)} · {it.who || 'admin-key'}{it.result ? ' · ' + it.result : ''}{it.error ? ' · lỗi: ' + it.error : ''}</span></div></article>) : <div class="empty sm">Chưa có log trong phiên này.</div>}</div>;
    })()}
  </section></div>;
}

export function SettingsPanel({ state, onReload, onRecount, onStatsRefresh, onImportBlogger, onSyncBlogger, onDownloadBackup, onRestoreBackup }) {
  const writeBlocked = !!(state.online && state.quota && state.quota.writesToday >= (state.quota.limit || 1000));
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
    <p class="hint">Admin giữ static Cloudflare Pages, không thêm dịch vụ trả phí và không đưa secret vào bundle. Các nút ghi KV đều đi qua endpoint Worker có sẵn.</p>
    <div class="v2ops-grid"><div class="v2mini"><b>Kết nối</b><p class="hint">Chế độ: {state.online ? 'Worker + ADMIN_KEY' : 'dữ liệu tĩnh/login frontend'}</p><p class="hint">API: <code>{state.apiBase || (window.CZ && window.CZ.API) || '—'}</code></p></div><div class="v2mini"><b>Quota ghi KV</b><p class="hint">Counter hiện tại: {num(state.quota && state.quota.writesToday)}/{num(state.quota && state.quota.limit || 1000)} · nguồn {state.quota && state.quota.source}</p></div></div>
    <div class="v2ops-grid">
      <div class="v2mini">
        <b>Backup một file</b>
        <p class="hint">Tải registry + book JSON hiện có. Mặc định strip lock hash để file backup an toàn hơn khi dùng cho repo.</p>
        <button class="btn ghost sm" type="button" disabled={!!busy} onClick={() => run('backup', onDownloadBackup)}>Tải backup JSON</button>
      </div>
      <div class="v2mini">
        <b>Khôi phục từ backup</b>
        <p class="hint">Chọn file backup JSON (do nút “Tải backup JSON” tạo) để ghi đè registry + book lên KV. Hỏi xác nhận mạnh và tính quota từng lượt ghi.</p>
        <input class="inp" type="file" accept=".json,application/json" onChange={(e) => { const f = e.currentTarget.files && e.currentTarget.files[0]; if (f && onRestoreBackup) onRestoreBackup(f).catch((er) => setResult('Lỗi: ' + (er.message || er))); e.currentTarget.value = ''; }} />
      </div>
      <div class="v2mini">
        <b>Nhập chương từ Blogger</b>
        <p class="hint">Tự tìm bài khớp tên truyện, hoặc dán link blogspot cụ thể. Ghi book + registry, không đổi schema.</p>
        <label class="fl">Bộ truyện</label><select class="inp" value={slug} onChange={(e) => setSlug(e.currentTarget.value)}>{lib.map((book) => <option value={book.slug}>{book.title}</option>)}</select>
        <label class="fl">URL bài viết Blogspot (không bắt buộc)</label><input class="inp" value={url} onInput={(e) => setUrl(e.currentTarget.value)} placeholder="https://chuseoz.blogspot.com/..." />
        <label class="fl">Cách nhập</label><select class="inp" value={mode} onChange={(e) => setMode(e.currentTarget.value)}><option value="append">Thêm vào cuối</option><option value="replace-last">Thay chương cuối</option></select>
        <button class="btn pri sm mt" type="button" disabled={!state.online || writeBlocked || !!busy || !slug} onClick={() => run('import', () => onImportBlogger({ slug, url, mode }))}>{busy === 'import' ? 'Đang nhập…' : 'Nhập chương'}</button>
      </div>
      <div class="v2mini">
        <b>Đồng bộ metadata Blogger</b>
        <p class="hint">Đọc list-novel + lịch ra chương rồi cập nhật registry KV; số chương thật trong KV vẫn là nguồn thắng.</p>
        <button class="btn ghost sm" type="button" disabled={!state.online || writeBlocked || !!busy} onClick={() => run('sync', onSyncBlogger)}>{busy === 'sync' ? 'Đang đồng bộ…' : 'Đồng bộ Blogger'}</button>
      </div>
    </div>
    <div class="v2ops-grid">
      <div class="v2mini v2overflow-card">
        <b>Overflow KV (free)</b>
        <p class="hint">Supabase: {(state.worker && state.worker.overflow && state.worker.overflow.supabase) ? 'connected' : 'unavailable'}. R2: {(state.worker && state.worker.overflow && state.worker.overflow.r2) ? 'connected' : 'unavailable'}. Bìa: {(state.worker && state.worker.overflow && state.worker.overflow.covers) ? 'Supabase Storage (bucket covers, 1 GB free — không unlimited)' : 'KV (chưa gắn SUPABASE_SERVICE_ROLE)'}. Ảnh chương: {(state.worker && state.worker.overflow && (state.worker.overflow.supabase || state.worker.overflow.r2)) ? 'overflow sang Supabase/R2 (bảng ssochuz_blobs)' : 'KV'}.</p>
        <p class="hint">“connected” nghĩa là Worker ĐÃ GẮN secret (SUPABASE_URL + SUPABASE_SERVICE_ROLE) — chưa chắc bảng đã có. Chưa chạy SQL dưới đây thì mọi ghi overflow sẽ lỗi và bản đầy đủ TỰ RỚT VỀ KV (fallback) — không mất dữ liệu, chỉ chưa đỡ được KV.</p>
        <p class="hint">Chưa gắn thì book/img vẫn nằm full trong KV. Secret <code>SUPABASE_SERVICE_ROLE</code> chỉ đặt trên Worker, không vào bundle.</p>
        <p class="hint">SQL một lần (Supabase SQL Editor, bảng ~500 MB free):</p>
        <pre class="v2result">{'create table if not exists public.ssochuz_blobs (\n  key text primary key,\n  value text not null,\n  mime text,\n  updated_at timestamptz default now()\n);\nalter table public.ssochuz_blobs enable row level security;'}</pre>
        <p class="hint">R2 10 GB free (tuỳ chọn): tạo bucket rồi binding <code>CZ_R2</code> trong wrangler.toml (đã ghi chú sẵn). Ghi xong KV chỉ còn “stub” nhỏ, bản đầy đủ nằm ở Supabase/R2.</p>
      </div>
    </div>
    {result ? <pre class="v2result">{result}</pre> : null}
    <div class="savebar"><button class="btn ghost" type="button" onClick={onReload}>Đọc lại dữ liệu</button><button class="btn ghost" type="button" disabled={!state.online || writeBlocked || !!busy} onClick={() => run('stats', onStatsRefresh)}>Flush stats cache</button><button class="btn pri" type="button" disabled={!state.online || writeBlocked || !!busy} onClick={() => run('recount', onRecount)}>Đếm lại số chương</button></div>
  </section></div>;
}
