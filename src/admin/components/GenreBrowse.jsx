import { h } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { countText } from '../utils/format.js';
import { listGenres, booksUsingGenre } from '../utils/genres.js';
import { BookCover } from './BookCover.jsx';
import { BookBadges, GenreBadge, CompletionBadge, PublishStatusBadge, LockedBadge, AdultBadge } from './Badges.jsx';

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

  const selected = pick === '__none__'
    ? { key: '__none__', name: 'Chưa gán thể loại', books: groups.uncategorized, genre: null }
    : groups.rows.find((r) => r.genre.slug === pick);

  return (
    <div id="pane-classify" class="v2pane">
      <section class="card2">
        <div class="row">
          <h3>Phân loại theo thể loại</h3>
          <span class="grow"></span>
          <button class="btn ghost sm" type="button" onClick={onManage}>Quản lý danh mục thể loại</button>
        </div>
        <p class="hint">Đây không phải tags. Bấm một thể loại để xem các bộ đang gán. Số đếm lấy từ registry đang mở — không gọi API riêng.</p>

        <div class="v2badge-legend">
          <b>Mẫu badge trên thẻ truyện</b>
          <span class="v2badges">
            {genres.filter((g) => g.is_visible).slice(0, 10).map((g) => (
              <GenreBadge key={g.slug} genre={g.slug} registry={registry} />
            ))}
          </span>
          <span class="sm muted">Thứ tự trên card: thể loại → hoàn thành → xuất bản → đã khóa → 18+</span>
          <span class="v2badges">
            <CompletionBadge status="Đang cập nhật" />
            <CompletionBadge status="Hoàn thành" />
            <CompletionBadge status="Sắp ra mắt" />
            <PublishStatusBadge status="draft" />
            <PublishStatusBadge status="pending_review" />
            <PublishStatusBadge status="published" />
            <PublishStatusBadge status="archived" />
            <LockedBadge isLocked />
            <AdultBadge is18 />
          </span>
        </div>
      </section>

      <section class="card2">
        <h3>Chọn thể loại</h3>
        <div class="v2genre-board">
          <button type="button" class={'v2genre-tile' + (!pick ? ' on' : '')} onClick={() => setPick('')}>
            <b>Tất cả</b>
            <span>{lib.length} bộ</span>
          </button>
          {groups.rows.map((row) => (
            <button type="button" class={'v2genre-tile' + (pick === row.genre.slug ? ' on' : '')} key={row.genre.slug}
              onClick={() => setPick(row.genre.slug)} title={row.genre.description || row.genre.name}>
              <GenreBadge genre={row.genre.slug} registry={registry} />
              <b>{row.genre.name}</b>
              <span>{row.books.length} bộ{row.genre.is_visible ? '' : ' · ẩn'}</span>
            </button>
          ))}
          <button type="button" class={'v2genre-tile' + (pick === '__none__' ? ' on' : '')} onClick={() => setPick('__none__')}>
            <b>Chưa gán</b>
            <span>{groups.uncategorized.length} bộ</span>
          </button>
        </div>
      </section>

      <section class="card2">
        <div class="row">
          <h3>{selected ? selected.name || (selected.genre && selected.genre.name) : 'Mọi thể loại'}</h3>
          <span class="grow"></span>
          {selected && selected.genre ? (
            <button class="btn ghost sm" type="button" onClick={() => onOpenLibrary && onOpenLibrary(selected.genre.slug)}>Mở trong Thư viện</button>
          ) : null}
        </div>
        {(() => {
          const books = selected ? selected.books : lib;
          if (!books.length) return <div class="empty sm">Không có bộ nào trong nhóm này.</div>;
          return (
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
          );
        })()}
        {!selected && lib.length > 80 ? <p class="hint">Đang hiện 80 bộ đầu. Chọn một thể loại để thu hẹp, hoặc mở Thư viện.</p> : null}
      </section>
    </div>
  );
}
