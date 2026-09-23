import { h } from 'preact';
import { BookCover } from './BookCover.jsx';
import { LockedBadge, PublishStatusBadge } from './Badges.jsx';

export function ChaptersHub({ registry, apiBase, onEdit }) {
  const lib = ((registry && registry.lib) || []).slice().sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
  const drafts = lib.filter((b) => String(b.pubStatus || 'published') === 'draft');
  const pending = lib.filter((b) => String(b.pubStatus || '') === 'pending_review');
  const scheduled = lib.filter((b) => String(b.pubStatus || '') === 'scheduled');
  function Row({ b, action }) {
    return (
      <li>
        <BookCover book={b} apiBase={apiBase} width={40} height={60} />
        <span class="grow">
          <b>{b.title}</b>
          <span class="sm muted">{b.updated || '—'} · {b.chapters || 0} chương</span>
          <span class="v2badges compact"><PublishStatusBadge book={b} /><LockedBadge book={b} /></span>
        </span>
        <button class="btn sm" type="button" onClick={() => onEdit(b.slug)}>{action || 'Sửa'}</button>
      </li>
    );
  }
  return (
    <div id="pane-chapters" class="v2pane">
      <section class="card2">
        <div class="row"><h3>Chương &amp; xuất bản</h3><span class="grow"></span><span class="sm muted">{lib.length} bộ</span></div>
        <p class="hint">Mở một bộ để sửa chương, kéo thả thứ tự, chèn ảnh trong nội dung, hẹn giờ hoặc lưu trữ. Không trộn tình trạng hoàn thành với trạng thái xuất bản. Hub chỉ dùng metadata registry — không tải full HTML chương.</p>
      </section>
      <section class="card2">
        <h3>Hàng đợi nháp</h3>
        {drafts.length ? <ul class="v2sort">{drafts.map((b) => <Row key={b.slug} b={b} action="Sửa" />)}</ul> : <div class="empty sm">Không có bộ nháp.</div>}
      </section>
      <section class="card2">
        <h3>Hàng đợi chờ duyệt</h3>
        {pending.length ? <ul class="v2sort">{pending.map((b) => <Row key={b.slug} b={b} action="Sửa" />)}</ul> : <div class="empty sm">Không có bộ chờ duyệt.</div>}
      </section>
      <section class="card2">
        <h3>Hàng đợi hẹn giờ</h3>
        {scheduled.length ? <ul class="v2sort">{scheduled.map((b) => <Row key={b.slug} b={b} action="Sửa" />)}</ul> : <div class="empty sm">Không có bộ hẹn giờ.</div>}
      </section>
      <section class="card2">
        <h3>Mới cập nhật</h3>
        <ul class="v2sort">
          {lib.slice(0, 16).map((b) => <Row b={b} action="Sửa chương" />)}
        </ul>
      </section>
    </div>
  );
}
