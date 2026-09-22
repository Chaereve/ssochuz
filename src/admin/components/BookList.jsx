import { h } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { countText, dateVN, num, statusCls } from '../utils/format.js';

const STATUSES = ['', 'Hoàn thành', 'Đang cập nhật', 'Sắp ra mắt'];
const PAGE_SIZE = 24;

function csvCell(value) {
  return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"';
}

function download(name, text, mime) {
  if (window.CZ && window.CZ.download) return window.CZ.download(name, text, mime);
  const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

export function BookList({ registry, selected, onSelected, onEdit, onNew, onBulkUpdate, onDelete }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('new');
  const [bulk, setBulk] = useState('');
  const [flag, setFlag] = useState('all');
  const [page, setPage] = useState(1);
  const lib = registry && registry.lib ? registry.lib : [];
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lib.filter((book) => {
      if (status && book.status !== status) return false;
      if (flag === '18' && !book.is18) return false;
      if (flag === 'lock' && !book.lock) return false;
      if (!q) return true;
      return [book.title, book.author, book.couple, book.slug].concat(Array.isArray(book.tags) ? book.tags : []).some((value) => String(value || '').toLowerCase().includes(q));
    }).sort((a, b) => {
      if (sort === 'chap') return (Number(b.chapters) || 0) - (Number(a.chapters) || 0);
      if (sort === 'az') return String(a.title || '').localeCompare(String(b.title || ''), 'vi');
      return String(b.updated || '').localeCompare(String(a.updated || ''));
    });
  }, [lib, query, status, sort, flag]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  useEffect(() => { if (page > pages) setPage(1); }, [pages]);
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const selectedMap = selected || {};
  const selectedCount = Object.keys(selectedMap).length;
  const allChecked = pageRows.length > 0 && pageRows.every((book) => selectedMap[book.slug]);
  const setOne = (slug, checked) => onSelected(Object.assign({}, selectedMap, checked ? { [slug]: 1 } : Object.fromEntries(Object.entries(selectedMap).filter(([key]) => key !== slug))));
  const setAll = (checked) => {
    const next = Object.assign({}, selectedMap);
    pageRows.forEach((book) => { if (checked) next[book.slug] = 1; else delete next[book.slug]; });
    onSelected(next);
  };
  const exportJson = () => download('ssochuz-library-filtered.json', JSON.stringify({ lib: rows }, null, 2), 'application/json;charset=utf-8');
  const exportCsv = () => {
    const header = ['title', 'slug', 'author', 'couple', 'year', 'status', 'chapters', 'countLabel', 'is18', 'updated', 'locked'];
    const body = rows.map((book) => header.map((key) => csvCell(key === 'locked' ? (book.lock ? 1 : 0) : book[key])).join(',')).join('\n');
    download('ssochuz-library-filtered.csv', header.join(',') + '\n' + body, 'text/csv;charset=utf-8');
  };
  const applyBulk = () => {
    if (!bulk) return;
    onBulkUpdate(bulk, Object.keys(selectedMap));
  };

  return (
    <div id="pane-list" class="v2pane">
      <section class="card2">
        <div class="row v2filters">
          <div><b>{num(rows.length)}</b> <span class="sm muted">/ {num(lib.length)} bộ</span></div>
          <span class="grow"></span>
          <input class="inp" value={query} onInput={(e) => { setQuery(e.currentTarget.value); setPage(1); }} placeholder="Tìm theo tên, tác giả, tag, slug…" />
          <select class="sel" value={status} onChange={(e) => { setStatus(e.currentTarget.value); setPage(1); }}>
            {STATUSES.map((item) => <option key={item || 'all'} value={item}>{item || 'Tất cả tình trạng'}</option>)}
          </select>
          <select class="sel" value={flag} onChange={(e) => { setFlag(e.currentTarget.value); setPage(1); }}>
            <option value="all">Mọi nhãn</option>
            <option value="18">Chỉ 18+</option>
            <option value="lock">Đang khóa mật mã</option>
          </select>
          <select class="sel" value={sort} onChange={(e) => setSort(e.currentTarget.value)}>
            <option value="new">Mới cập nhật</option><option value="chap">Nhiều chương</option><option value="az">Tên A→Z</option>
          </select>
          <button class="btn ghost sm" type="button" onClick={onNew}>Thêm bộ</button>
        </div>
        <div class="bulkbar row mt">
          <label class="row sm"><input type="checkbox" checked={allChecked} onChange={(e) => setAll(e.currentTarget.checked)} style="width:auto" /> chọn tất cả trang này</label>
          <select class="sel" value={bulk} onChange={(e) => setBulk(e.currentTarget.value)}>
            <option value="">— việc cần làm —</option>
            <option value="st:Hoàn thành">Đổi tình trạng → Hoàn thành</option>
            <option value="st:Đang cập nhật">Đổi tình trạng → Đang cập nhật</option>
            <option value="st:Sắp ra mắt">Đổi tình trạng → Sắp ra mắt</option>
            <option value="18:1">Gắn nhãn 18+</option>
            <option value="18:0">Bỏ nhãn 18+</option>
          </select>
          <button class="btn ghost sm" type="button" onClick={applyBulk} disabled={!selectedCount || !bulk}>Áp dụng</button>
          <button class="btn ghost sm" type="button" onClick={exportJson}>Xuất JSON</button>
          <button class="btn ghost sm" type="button" onClick={exportCsv}>Xuất CSV</button>
          <span class="sm muted">{selectedCount ? `${selectedCount} bộ được chọn` : ''}</span>
        </div>
        <div class="v2table-wrap">
          <table class="tbl v2book-table">
            <thead><tr><th></th><th>Bộ truyện</th><th>Tác giả / couple</th><th>Số chương</th><th>Tình trạng</th><th>Cập nhật</th><th>Thao tác</th></tr></thead>
            <tbody>
              {pageRows.map((book) => (
                <tr key={book.slug}>
                  <td data-lb="Chọn"><input type="checkbox" checked={!!selectedMap[book.slug]} onChange={(e) => setOne(book.slug, e.currentTarget.checked)} /></td>
                  <td data-lb="Bộ truyện">
                    <span class="v2rowmain">
                      <span class={`v2thumb ${book.thumb ? '' : 'v2thumb-empty'}`}>{book.thumb ? <img src={book.thumb} alt="" loading="lazy" decoding="async" /> : null}</span>
                      <span class="v2rowtext"><b>{book.title}</b>{book.lock ? <span class="pill acc v2lock" title="Truyện đang có mật mã">🔒 khóa</span> : null}<span class="sm muted">{book.slug}</span>{Array.isArray(book.tags) && book.tags.length ? <span class="v2rowtags">{book.tags.slice(0, 3).map((t) => <i key={t}>{t}</i>)}{book.tags.length > 3 ? <i>+{book.tags.length - 3}</i> : null}</span> : null}</span>
                    </span>
                  </td>
                  <td data-lb="Tác giả / couple"><span>{book.author || '—'}</span><span class="sm muted">{book.couple || ''}</span></td>
                  <td data-lb="Số chương">{countText(book)}</td>
                  <td data-lb="Tình trạng"><span class={`pill ${statusCls(book.status)}`}><span class="d"></span>{book.status || '—'}</span>{book.is18 ? <span class="pill warn">18+</span> : null}</td>
                  <td data-lb="Cập nhật">{dateVN(book.updated)}</td>
                  <td data-lb="Thao tác" class="v2actions"><button class="btn ghost sm" type="button" onClick={() => onEdit(book.slug)}>Sửa</button><button class="btn ghost sm danger" type="button" onClick={() => onDelete(book.slug)}>Xoá</button></td>
                </tr>
              ))}
              {!pageRows.length ? <tr><td colSpan="7"><div class="empty sm">Không có bộ nào khớp bộ lọc.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
        {pages > 1 ? (
          <div class="row mt v2pager">
            <button class="btn ghost sm" type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Trang trước</button>
            <span class="sm muted">Trang {num(page)}/{num(pages)}</span>
            <button class="btn ghost sm" type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>Trang sau →</button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
