import { h } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { countText } from '../utils/format.js';
import { listGenres, booksUsingGenre } from '../utils/genres.js';
import { BookCover } from './BookCover.jsx';
import { BookBadges, GenreBadge } from './Badges.jsx';

export function GenreBrowse({ registry, apiBase, onEdit, onOpenLibrary, onManage }) {
  const genres = listGenres(registry);
  const lib = (registry && registry.lib) || [];
  const [pick, setPick] = useState('');

  const groups = useMemo(() => {
    const rows = genres.map((g) => ({
      genre: g,
      books: booksUsingGenre(registry, g.slug),
    }));
    const uncategorized = lib.filter((b) => !String((b && (b.genre || b.genreName)) || '').trim());
    return { rows, uncategorized };
  }, [genres, lib, registry]);

  const featured = groups.rows.filter((r) => r.books.length).slice(0, 4);
  const selected = pick === '__none__'
    ? { key: '__none__', name: 'Chưa gán thể loại', books: groups.uncategorized, genre: null }
    : groups.rows.find((r) => r.genre.slug === pick);
  const heading = selected ? (selected.name || (selected.genre && selected.genre.name)) : 'Mọi thể loại';
  const books = selected ? selected.books : lib;

  return (
    <div id="pane-classify" class="v2pane">
      <section class="card2">
        <div class="row">
          <h3>Phân loại theo thể loại</h3>
          <span class="grow"></span>
          <span class="sm muted">{genres.length} thể loại</span>
          <button class="btn ghost sm" type="button" onClick={onManage}>Quản lý danh mục</button>
        </div>
        <p class="hint">Bấm một thể loại để xem các bộ đang gán. Số đếm lấy từ registry đang mở.</p>
        <div class="v2genre-cloud" role="group" aria-label="Thể loại">
          <button type="button" class={'v2gchip' + (!pick ? ' on' : '')} onClick={() => setPick('')}>
            Tất cả<em>{lib.length}</em>
          </button>
          {groups.rows.map((row) => (
            <button type="button" class={'v2gchip' + (pick === row.genre.slug ? ' on' : '')} key={row.genre.slug}
              onClick={() => setPick(row.genre.slug)} title={row.genre.description || row.genre.name}>
              {row.genre.name}<em>{row.books.length}</em>
            </button>
          ))}
          <button type="button" class={'v2gchip' + (pick === '__none__' ? ' on' : '')} onClick={() => setPick('__none__')}>
            Chưa gán<em>{groups.uncategorized.length}</em>
          </button>
        </div>
      </section>

      {featured.length ? (
        <section class="card2">
          <div class="row">
            <h3>Bạn đang quan tâm gì?</h3>
            <span class="grow"></span>
            <span class="sm muted">Thể loại có nhiều bộ nhất</span>
          </div>
          <div class="v2topic-grid">
            {featured.map((row) => (
              <button type="button" class={'v2topic' + (pick === row.genre.slug ? ' on' : '')} key={row.genre.slug}
                onClick={() => setPick(row.genre.slug)}>
                <GenreBadge genre={row.genre.slug} registry={registry} />
                <b>{row.genre.name}</b>
                <span>{row.books.length} bộ · Xem chủ đề ›</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section class="card2">
        <div class="row">
          <h3>{heading}</h3>
          <span class="grow"></span>
          {selected && selected.genre ? (
            <button class="btn ghost sm" type="button" onClick={() => onOpenLibrary && onOpenLibrary(selected.genre.slug)}>Mở trong Thư viện</button>
          ) : null}
        </div>
        {!books.length ? <div class="empty sm">Không có bộ nào trong nhóm này.</div> : (
          <ul class="v2sort">
            {books.slice(0, 80).map((b) => (
              <li key={b.slug}>
                <BookCover book={b} apiBase={apiBase} width={40} height={60} />
                <span class="grow">
                  <b>{b.title}</b>
                  <span class="sm muted">{b.author || '—'} · {countText(b)}</span>
                  <BookBadges book={b} registry={registry} compact />
                </span>
                <button class="btn sm" type="button" onClick={() => onEdit && onEdit(b.slug)}>Sửa</button>
              </li>
            ))}
          </ul>
        )}
        {!selected && lib.length > 80 ? <p class="hint">Đang hiện 80 bộ đầu. Chọn một thể loại để thu hẹp, hoặc mở Thư viện.</p> : null}
      </section>
    </div>
  );
}
