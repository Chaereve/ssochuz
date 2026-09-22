import { h } from 'preact';
import { BookCover } from './BookCover.jsx';

export function ChaptersHub({ registry, apiBase, onEdit }) {
  const lib = ((registry && registry.lib) || []).slice().sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
  const pending = lib.filter((b) => {
    const st = String(b.pubStatus || 'published');
    return st === 'draft' || st === 'pending_review' || st === 'scheduled';
  });
  return (
    <div id="pane-chapters" class="v2pane">
      <section class="card2">
        <div class="row"><h3>Chương &amp; xuất bản</h3><span class="grow"></span><span class="sm muted">{lib.length} bộ</span></div>
        <p class="hint">Mở một bộ để sửa chương, kéo thả thứ tự, chèn ảnh trong nội dung, hẹn giờ hoặc lưu trữ. Không trộn tình trạng hoàn thành với trạng thái xuất bản.</p>
      </section>
      <section class="card2">
        <h3>Chờ biên tập / nháp / hẹn giờ</h3>
        {pending.length ? (
          <ul class="v2sort">
            {pending.map((b) => (
              <li key={b.slug}>
                <BookCover book={b} apiBase={apiBase} width={40} height={60} />
                <span class="grow"><b>{b.title}</b><span class="sm muted">{b.pubStatus} · {b.chapters || 0} chương</span></span>
                <button class="btn sm" type="button" onClick={() => onEdit(b.slug)}>Sửa</button>
              </li>
            ))}
          </ul>
        ) : <div class="empty sm">Không có bộ nào đang nháp / chờ duyệt / hẹn giờ.</div>}
      </section>
      <section class="card2">
        <h3>Mới cập nhật</h3>
        <ul class="v2sort">
          {lib.slice(0, 16).map((b) => (
            <li key={b.slug}>
              <BookCover book={b} apiBase={apiBase} width={40} height={60} />
              <span class="grow"><b>{b.title}</b><span class="sm muted">{b.updated || '—'} · {b.chapters || 0} chương</span></span>
              <button class="btn ghost sm" type="button" onClick={() => onEdit(b.slug)}>Sửa chương</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
