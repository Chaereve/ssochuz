import { h } from 'preact';
import { useState } from 'preact/hooks';
import { coverOf, resolveCover } from '../utils/cover.js';

export function BookCover({ book, src, alt, apiBase, title, className = 'v2cover', fallback, width = 80, height = 120 }) {
  const [failed, setFailed] = useState(false);
  const url = resolveCover(src, apiBase) || coverOf(book, apiBase);
  const show = url && !failed;
  const label = alt || (book && book.coverAlt) || (title || (book && book.title) ? ('Bìa ' + (title || book.title)) : 'Bìa truyện');
  return (
    <span class={`${className}${show ? ' skel' : ' noimg'}`} data-t={title || (book && book.title) || ''} title={label}>
      {show
        ? <img src={url} alt={label} width={width} height={height} loading="lazy" decoding="async" referrerpolicy="no-referrer"
            onError={() => {
              if (fallback && fallback !== url) { setFailed(false); }
              else setFailed(true);
            }} />
        : <span class="v2cover-ph" aria-hidden="true">📖</span>}
    </span>
  );
}
