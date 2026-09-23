import { h } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { countText } from '../utils/format.js';
import { BookCover } from './BookCover.jsx';
import { BookBadges, CompletionBadge, PublishStatusBadge, LockedBadge } from './Badges.jsx';
import { COMPLETION_STATUSES, VISIBILITIES } from '../utils/books.js';

const PAGE = 24;

export function BookList({ registry, selected, onSelected, onEdit, onNew, onBulkUpdate, onDelete, apiBase, initialQuery = '', writeBlocked = false }) {
  const lib = (registry && registry.lib) || [];
  const [q, setQ] = useState(initialQuery);
  const [status, setStatus] = useState('');
  const [adult, setAdult] = useState('');
  const [pub, setPub] = useState('');
  const [vis, setVis] = useState('');
  const [locked, setLocked] = useState('');
  const [page, setPage] = useState(1);
  const [view, setView] = useState('table');

  const filtered = useMemo(() => {
    return lib.filter((book) => {
      if (status && book.status !== status) return false;
      if ((adult === '1' || adult === '18') && !book.is18) return false;
      if (adult === '0' && book.is18) return false;
      if (pub && String(book.pubStatus || 'published') !== pub) return false;
      if (vis && String(book.visibility || 'public') !== vis) return false;
      if (locked === '1' && !book.lock) return false;
      if (locked === '0' && book.lock) return false;
      if (!q) return true;
      const hay = [book.title, book.author, book.couple, book.slug].join(' ').toLowerCase();
      return hay.indexOf(q.toLowerCase()) >= 0;
    }).sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
  }, [lib, q, status, adult, pub, vis, locked]);

  const total = Math.max(1, Math.ceil(filtered.length / PAGE));
  const safePage = Math.min(page, total);
  const rows = filtered.slice((safePage - 1) * PAGE, safePage * PAGE);
  const selectedSlugs = Object.keys(selected || {}).filter((slug) => selected[slug]);
  const allOnPage = rows.length > 0 && rows.every((book) => selected[book.slug]);
  const filtersOn = !!(q || status || adult || pub || vis || locked);

  function toggleAll(on) {
    const next = Object.assign({}, selected);
    rows.forEach((book) => { if (on) next[book.slug] = true; else delete next[book.slug]; });
    onSelected(next);
  }
  function clearFilters() {
    setQ(''); setStatus(''); setAdult(''); setPub(''); setVis(''); setLocked(''); setPage(1);
  }

  return (
    <div id="pane-list">
      <div class="row v2toolbar">
        <input class="inp" placeholder="Tìm tên, tác giả, couple…" aria-label="Tìm trong thư viện" value={q} onInput={(e) => { setQ(e.target.value); setPage(1); }} />
        <span class="v2filters">
          <select class="inp" aria-label="Lọc tình trạng hoàn thành" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Mọi tình trạng</option>
            {COMPLETION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select class="inp" aria-label="Lọc độ tuổi" value={adult} onChange={(e) => { setAdult(e.target.value); setPage(1); }}>
            <option value="">Mọi độ tuổi</option>
            <option value="0">Mọi lứa tuổi</option>
            <option value="18">18+</option>
          </select>
          <select class="inp" aria-label="Lọc trạng thái xuất bản" value={pub} onChange={(e) => { setPub(e.target.value); setPage(1); }}>
            <option value="">Mọi xuất bản</option>
            <option value="draft">Nháp</option>
            <option value="pending_review">Chờ duyệt</option>
            <option value="scheduled">Hẹn giờ</option>
            <option value="published">Xuất bản</option>
            <option value="archived">Lưu trữ</option>
          </select>
          <select class="inp" aria-label="Lọc chế độ hiển thị" value={vis} onChange={(e) => { setVis(e.target.value); setPage(1); }}>
            <option value="">Mọi hiển thị</option>
            {VISIBILITIES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <select class="inp" aria-label="Lọc truyện đang khóa" value={locked} onChange={(e) => { setLocked(e.target.value); setPage(1); }}>
            <option value="">Khóa: tất cả</option>
            <option value="1">Đã khóa</option>
            <option value="0">Không khóa</option>
          </select>
          {filtersOn ? <button class="btn ghost sm" type="button" onClick={clearFilters}>Xoá lọc</button> : null}
        </span>
        <span class="seg" role="group" aria-label="Kiểu hiển thị">
          <button type="button" class={view === 'table' ? 'on' : ''} aria-pressed={view === 'table'} onClick={() => setView('table')}>Bảng</button>
          <button type="button" class={view === 'grid' ? 'on' : ''} aria-pressed={view === 'grid'} onClick={() => setView('grid')}>Lưới</button>
        </span>
        <span class="grow"></span>
        <button class="btn pri" type="button" onClick={onNew}>Thêm bộ</button>
      </div>
      {selectedSlugs.length ? (
        <div class="row v2bulk" role="status">
          <span><b>{selectedSlugs.length}</b> bộ đã chọn</span>
          <select class="inp" aria-label="Thao tác hàng loạt" disabled={writeBlocked} onChange={(e) => { if (e.target.value) onBulkUpdate(e.target.value, selectedSlugs); e.target.value = ''; }}>
            <option value="">Thao tác hàng loạt…</option>
            <option value="st:Hoàn thành">Đặt Hoàn thành</option>
            <option value="st:Đang cập nhật">Đặt Đang cập nhật</option>
            <option value="pub:published">Xuất bản</option>
            <option value="pub:archived">Lưu trữ</option>
            <option value="18:1">Bật 18+</option>
            <option value="18:0">Tắt 18+</option>
          </select>
          {writeBlocked ? <span class="sm muted">Quota KV đã hết — thao tác hàng loạt tạm khóa.</span> : null}
          <span class="grow"></span>
          <button class="btn ghost sm" type="button" onClick={() => onSelected({})}>Bỏ chọn</button>
        </div>
      ) : null}
      {!rows.length ? (
        <div class="empty">
          <div class="big">{lib.length ? 'Không có bộ nào khớp' : 'Thư viện chưa có bộ nào'}</div>
          {lib.length
            ? <span>Thử bỏ bớt bộ lọc hoặc tìm từ khóa khác.</span>
            : <span>Tạo bộ truyện đầu tiên để bắt đầu.</span>}
          <div class="v2empty-actions">
            {lib.length && filtersOn ? <button class="btn ghost sm" type="button" onClick={clearFilters}>Xoá bộ lọc</button> : null}
            {!lib.length ? <button class="btn pri sm" type="button" onClick={onNew}>Thêm bộ</button> : null}
          </div>
        </div>
      ) : view === 'grid' ? (
        <div class="v2grid">
          {rows.map((book) => (
            <div class="v2gcard" key={book.slug}>
              <BookCover book={book} apiBase={apiBase} className="v2thumb" width={160} height={240} />
              <b title={book.title}>{book.title}</b>
              <span class="sm muted v2gcard-author" title={book.author || ''}>{book.author || '—'}</span>
              <BookBadges book={book} compact />
              <span class="v2gcard-meta"><span>{countText(book)}</span><span>{book.updated || '—'}</span></span>
              <span class="v2gcard-acts">
                <button class="btn ghost sm" type="button" onClick={() => onEdit(book.slug)}>Sửa</button>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div class="v2tablewrap">
          <table class="v2book-table">
            <thead>
              <tr>
                <th><input type="checkbox" checked={allOnPage} onChange={(e) => toggleAll(e.target.checked)} aria-label="Chọn cả trang" /></th>
                <th>Bìa</th><th>Truyện</th><th>Tác giả</th><th>Hoàn thành</th><th>Xuất bản</th><th>Chương</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((book) => (
                <tr key={book.slug}>
                  <td data-lb="Chọn"><input type="checkbox" checked={!!selected[book.slug]} aria-label={'Chọn ' + (book.title || book.slug)} onChange={(e) => onSelected(Object.assign({}, selected, { [book.slug]: e.target.checked }))} /></td>
                  <td data-lb="Bìa"><BookCover book={book} apiBase={apiBase} className="v2thumb" width={44} height={66} /></td>
                  <td data-lb="Truyện">
                    <span class="v2rowtext">
                      <b title={book.title}>{book.title}</b>
                      <LockedBadge book={book} />
                      <span class="sm muted">{book.slug}{book.updated ? ' · ' + book.updated : ''}</span>
                    </span>
                  </td>
                  <td data-lb="Tác giả">{book.author || '—'}</td>
                  <td data-lb="Hoàn thành"><CompletionBadge book={book} /></td>
                  <td data-lb="Xuất bản"><PublishStatusBadge book={book} /></td>
                  <td data-lb="Chương">{countText(book)}</td>
                  <td class="v2acts v2actions" data-lb="Thao tác">
                    <button class="btn ghost sm" type="button" onClick={() => onEdit(book.slug)}>Sửa</button>
                    <button class="btn ghost sm danger" type="button" disabled={writeBlocked} title={writeBlocked ? 'Quota KV hôm nay đã hết' : 'Xoá bộ — cần gõ slug xác nhận'} onClick={() => onDelete(book.slug)}>Xoá</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {total > 1 ? (
        <div class="v2pager">
          <button class="btn ghost sm" type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>Trang trước</button>
          <span>Trang {safePage}/{total} · {filtered.length} bộ</span>
          <button class="btn ghost sm" type="button" disabled={safePage >= total} onClick={() => setPage(safePage + 1)}>Trang sau</button>
        </div>
      ) : null}
    </div>
  );
}
