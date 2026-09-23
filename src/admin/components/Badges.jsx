import { h } from 'preact';
import { genreNameOf, listGenres } from '../utils/genres.js';
import { pubLabel } from '../utils/books.js';

/* Mapping màu nhẹ, tập trung — không hardcode lặp lại từng trang. */
const GENRE_TONE = {
  fantasy: 'violet', 'ky-ao': 'violet', 'kỳ ảo': 'violet', 'tien-hiep': 'violet',
  romance: 'pink', 'lang-man': 'pink', 'lãng mạn': 'pink', 'ngon-tinh': 'pink', 'ngon-sung': 'pink',
  action: 'orange', 'hanh-dong': 'orange', 'hành động': 'orange',
  mystery: 'navy', 'trinh-tham': 'navy', 'trinh thám': 'navy',
  horror: 'wine', 'kinh-di': 'wine', 'kinh dị': 'wine',
  comedy: 'gold', 'hai-huoc': 'gold', 'hài hước': 'gold',
  drama: 'blue',
  'slice-of-life': 'green', 'slice of life': 'green', 'doi-thuong': 'green',
  'dam-my': 'pink', 'bach-hop': 'pink', 'hien-dai': 'blue', 'co-trang': 'navy',
  'hoc-duong': 'green',
};

function fold(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
}

export function genreTone(genre, registry) {
  const raw = String(genre || '').trim();
  if (!raw) return 'gray';
  const hit = listGenres(registry).find((g) => g.slug === raw || g.name === raw);
  const key = fold((hit && (hit.slug || hit.name)) || raw);
  if (GENRE_TONE[key]) return GENRE_TONE[key];
  for (const k of Object.keys(GENRE_TONE)) {
    if (key.indexOf(k) >= 0) return GENRE_TONE[k];
  }
  return 'gray';
}

export function GenreBadge({ genre, book, registry, class: cls = '' }) {
  const raw = genre != null ? genre : (book && (book.genre || book.genreName)) || '';
  const name = book || registry ? (genreNameOf(book || { genre: raw }, registry) || String(raw || '').trim()) : String(raw || '').trim();
  if (!name) return null;
  const hit = listGenres(registry).find((g) => g.slug === raw || g.name === raw || g.name === name);
  const label = hit ? hit.name : (name || 'Thể loại đã xoá');
  const hidden = hit && hit.is_visible === false;
  const title = hidden ? (label + ' (đã ẩn)') : (!hit ? (label + ' (không còn trong danh mục)') : label);
  return (
    <span
      class={'v2badge v2badge-genre tone-' + genreTone(hit ? hit.slug : raw, registry) + (hidden ? ' is-hidden' : '') + (cls ? ' ' + cls : '')}
      title={title}
    >{label}</span>
  );
}

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

/* Thứ tự trên thẻ: Thể loại → Hoàn thành → Xuất bản → Đã khóa → 18+ */
export function BookBadges({ book, registry, compact = false }) {
  if (!book) return null;
  return (
    <span class={'v2badges' + (compact ? ' compact' : '')}>
      <GenreBadge book={book} registry={registry} />
      <CompletionBadge book={book} />
      <PublishStatusBadge book={book} />
      <LockedBadge book={book} />
      <AdultBadge book={book} />
    </span>
  );
}
