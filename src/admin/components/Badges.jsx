import { h } from 'preact';
import { pubLabel } from '../utils/books.js';

export function CompletionBadge({ status, book }) {
  const value = status != null ? status : (book && book.status) || '';
  const text = String(value || '').trim();
  if (!text) return null;
  let tone = 'gray';
  if (text === 'Hoàn thành') tone = 'ok';
  else if (text === 'Đang cập nhật') tone = 'info';
  else if (text === 'Sắp ra mắt') tone = 'soon';
  return <span class={'v2badge v2badge-completion tone-' + tone} title={'Tình trạng hoàn thành: ' + text}>{text}</span>;
}

const PUB_TONE = {
  draft: 'gray', pending_review: 'amber', approved: 'blue',
  scheduled: 'violet', published: 'ok', rejected: 'bad', archived: 'slate',
};

export function PublishStatusBadge({ status, book }) {
  const id = String(status != null ? status : (book && book.pubStatus) || 'published');
  const label = pubLabel(id);
  return <span class={'v2badge v2badge-pub tone-' + (PUB_TONE[id] || 'gray')} title={'Trạng thái xuất bản: ' + label}>{label}</span>;
}

export function LockedBadge({ isLocked, book, locked }) {
  const on = isLocked != null ? !!isLocked : (locked != null ? !!locked : !!(book && book.lock));
  if (!on) return null;
  return (
    <span class="v2badge v2badge-lock" title="Truyện hiện đang bị khóa đối với người đọc.">
      <span aria-hidden="true">🔒</span> Đã khóa
    </span>
  );
}

export function AdultBadge({ book, is18 }) {
  const on = is18 != null ? !!is18 : !!(book && book.is18);
  if (!on) return null;
  return <span class="v2badge v2badge-18" title="Nội dung 18+">18+</span>;
}

/* Thứ tự trên thẻ: Hoàn thành → Xuất bản → Đã khóa → 18+ */
export function BookBadges({ book, compact = false }) {
  if (!book) return null;
  return (
    <span class={'v2badges' + (compact ? ' compact' : '')}>
      <CompletionBadge book={book} />
      <PublishStatusBadge book={book} />
      <LockedBadge book={book} />
      <AdultBadge book={book} />
    </span>
  );
}
