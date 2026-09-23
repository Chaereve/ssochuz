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

export function bookUsesGenre(book, slugOrName, registry) {
  const key = String(slugOrName || '').toLowerCase();
  if (!key || !book) return false;
  const raw = String((book.genre || book.genreName) || '').toLowerCase();
  if (!raw) return false;
  if (raw === key) return true;
  const named = String(genreNameOf(book, registry) || '').toLowerCase();
  if (named === key) return true;
  const hit = listGenres(registry).find((g) => String(g.slug).toLowerCase() === key || String(g.name).toLowerCase() === key);
  if (!hit) return false;
  return raw === String(hit.slug).toLowerCase() || raw === String(hit.name).toLowerCase() || named === String(hit.name).toLowerCase();
}

export function booksUsingGenre(registry, slugOrName) {
  return ((registry && registry.lib) || []).filter((b) => bookUsesGenre(b, slugOrName, registry));
}

function foldVi(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
}

const GENRE_HINTS = {
  'ngon-tinh': ['ngon tinh', 'lang man', 'tinh cam', 'sung', 'romance', 'yeu', 'tinh yeu', 'he', 'nu chinh'],
  'dam-my': ['dam my', 'bl', 'boys love', 'dan nam', 'omega', 'alpha'],
  'bach-hop': ['bach hop', 'gl', 'girls love', 'nu nu', 'sapphic'],
  'hien-dai': ['hien dai', 'do thi', 'thanh thi', 'cong so', 'ceo', 'showbiz'],
  'co-trang': ['co trang', 'cung dinh', 'hau cung', 'trieu dinh', 'kiem hiep', 'co dai', 'vuong gia', 'phi tan'],
  'hoc-duong': ['hoc duong', 'hoc sinh', 'truong', 'lop', 'campus', 'sinh vien'],
  'fantasy': ['fantasy', 'phep', 'ma phap', 'than thoai', 'tien hiep', 'di gioi', 'rong'],
  'hanh-dong': ['hanh dong', 'chien dau', 'vo thuat', 'trinh sat', 'pha an'],
  'kinh-di': ['kinh di', 'ma', 'horror', 'giet', 'rung ron', 'linh'],
  'hai-huoc': ['hai huoc', 'hai', 'comedy', 'vui', 'tre'],
};

/* Gợi ý thể loại từ tên/tóm tắt/couple + thể loại các bộ cùng tác giả. Không phải tags. */
export function suggestGenres(hint, registry, current) {
  const hay = foldVi([hint, current].filter(Boolean).join(' '));
  const genres = listGenres(registry).filter((g) => g.is_visible);
  const scores = {};
  genres.forEach((g) => {
    let score = 0;
    const foldedName = foldVi(g.name + ' ' + g.slug + ' ' + (g.description || ''));
    if (hay && foldedName && hay.indexOf(foldVi(g.name)) >= 0) score += 6;
    if (hay && hay.indexOf(foldVi(g.slug.replace(/-/g, ' '))) >= 0) score += 5;
    (GENRE_HINTS[g.slug] || []).forEach((kw) => { if (hay.indexOf(kw) >= 0) score += 3; });
    scores[g.slug] = score;
  });
  const lib = (registry && registry.lib) || [];
  const author = foldVi(String(hint || '').split(/\s+/).slice(0, 8).join(' '));
  lib.forEach((book) => {
    const gslug = String(book.genre || '').trim();
    if (!gslug || scores[gslug] == null) return;
    const sameAuthor = foldVi(book.author || '') && hay.indexOf(foldVi(book.author)) >= 0;
    const sameCouple = foldVi(book.couple || '') && hay.indexOf(foldVi(book.couple)) >= 0;
    if (sameAuthor) scores[gslug] += 2;
    if (sameCouple) scores[gslug] += 1;
    if (author && sameAuthor) scores[gslug] += 1;
  });
  return genres
    .map((g) => ({ slug: g.slug, name: g.name, score: scores[g.slug] || 0 }))
    .filter((g) => g.score > 0 && g.slug !== current)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'vi'))
    .slice(0, 3);
}
