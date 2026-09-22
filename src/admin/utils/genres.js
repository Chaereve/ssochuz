import { slugify } from './books.js';

export const DEFAULT_GENRES = [
  { slug: 'ngon-tinh', name: 'Ngôn tình', description: 'Lãng mạn, tình cảm', display_order: 1, is_visible: true },
  { slug: 'dam-my', name: 'Đam mỹ', description: '', display_order: 2, is_visible: true },
  { slug: 'bach-hop', name: 'Bách hợp', description: '', display_order: 3, is_visible: true },
  { slug: 'hien-dai', name: 'Hiện đại', description: '', display_order: 4, is_visible: true },
  { slug: 'co-trang', name: 'Cổ trang', description: '', display_order: 5, is_visible: true },
  { slug: 'hoc-duong', name: 'Học đường', description: '', display_order: 6, is_visible: true },
  { slug: 'fantasy', name: 'Fantasy', description: '', display_order: 7, is_visible: true },
  { slug: 'hanh-dong', name: 'Hành động', description: '', display_order: 8, is_visible: true },
  { slug: 'kinh-di', name: 'Kinh dị', description: '', display_order: 9, is_visible: true },
  { slug: 'hai-huoc', name: 'Hài hước', description: '', display_order: 10, is_visible: true },
];

export function listGenres(registry) {
  const raw = registry && registry.settings && Array.isArray(registry.settings.genres) ? registry.settings.genres : null;
  const src = raw && raw.length ? raw : DEFAULT_GENRES;
  return src.map((g, i) => normalizeGenre(g, i)).filter((g) => g.name).sort((a, b) => (a.display_order - b.display_order) || a.name.localeCompare(b.name, 'vi'));
}

export function normalizeGenre(g, i = 0) {
  const name = String((g && (g.name || g.title)) || '').trim().slice(0, 40);
  const slug = slugify((g && g.slug) || name) || ('the-loai-' + (i + 1));
  return {
    slug,
    name: name || slug,
    description: String((g && g.description) || '').trim().slice(0, 200),
    display_order: Number(g && g.display_order) || (i + 1),
    is_visible: g && g.is_visible === false ? false : true,
  };
}

export function genreNameOf(book, registry) {
  const raw = String((book && (book.genre || book.genreName)) || '').trim();
  if (!raw) return '';
  const hit = listGenres(registry).find((g) => g.slug === raw || g.name === raw);
  return (hit && hit.name) || raw;
}

export function booksUsingGenre(registry, slugOrName) {
  const key = String(slugOrName || '').toLowerCase();
  return ((registry && registry.lib) || []).filter((b) => {
    const g = String((b && (b.genre || b.genreName)) || '').toLowerCase();
    return g && (g === key);
  });
}
