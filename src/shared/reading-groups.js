/* Optional registry metadata only. No chapter, progress, follow or push writes. */
export const PART_TYPES = { main: 'Chính truyện', extra: 'Ngoại truyện', special: 'Special', sequel: 'Phần tiếp theo' };
export function searchText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
}
export function aliasesOf(book) {
  const source = Array.isArray(book?.aliases) ? book.aliases : [];
  const seen = new Set();
  return source.filter(value => {
    if (typeof value !== 'string' || !value.trim() || value.length > 160) return false;
    const key = searchText(value);
    if (key === searchText(book.title) || seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 20).map(value => value.trim());
}
export function parseAliases(value, title) {
  const rows = Array.isArray(value) ? value : String(value || '').split(/\r?\n/);
  if (rows.filter(x => String(x).trim()).length > 20 || rows.some(x => typeof x !== 'string' || x.length > 160)) {
    throw new Error('Tối đa 20 tên khác, mỗi tên không quá 160 ký tự.');
  }
  return aliasesOf({title, aliases: rows});
}
export function matchedAlias(book, query) {
  const q = searchText(query);
  return q ? aliasesOf(book).find(alias => searchText(alias).includes(q)) || '' : '';
}
export function readingParts(lib, book) {
  if (!book || typeof book.readingGroup !== 'string' || !book.readingGroup) return [];
  return (lib || []).filter(n => n && n.readingGroup === book.readingGroup && typeof n.slug === 'string' && /^[a-z0-9][a-z0-9_-]*$/i.test(n.slug))
    .sort((a, b) => (Number(a.readingOrder) || 0) - (Number(b.readingOrder) || 0) || a.slug.localeCompare(b.slug));
}
export function clearReadingGroup(book) {
  delete book.readingGroup; delete book.readingOrder; delete book.partType;
}
export function applyReadingGroup(registry, slug, parts) {
  if (parts === undefined) return; // old admin/form: preserve existing metadata
  const lib = registry.lib || [], current = lib.find(n => n.slug === slug);
  if (!current || !Array.isArray(parts) || parts.length > 100) throw new Error('Nhóm phần truyện không hợp lệ (tối đa 100 phần).');
  if (parts.length && (parts.length < 2 || !parts.some(p => p.slug === slug))) throw new Error('Nhóm cần ít nhất 2 phần và phải có truyện đang sửa.');
  const seen = new Set();
  const selected = parts.map(part => {
    const book = lib.find(n => n.slug === part.slug);
    if (!book || seen.has(part.slug) || !Object.hasOwn(PART_TYPES, part.type)) throw new Error('Phần truyện bị trùng, đã bị xóa hoặc có loại không hợp lệ.');
    if (book.readingGroup && book.readingGroup !== current.readingGroup) throw new Error('“' + book.title + '” thuộc nhóm khác. Hãy gỡ khỏi nhóm cũ trước.');
    seen.add(part.slug); return book;
  });
  const oldGroup = current.readingGroup;
  let id = oldGroup || 'reading-group-1', suffix = 2;
  if (!oldGroup) while (lib.some(n => n.readingGroup === id)) id = 'reading-group-' + suffix++;
  // Validate everything before touching any record. One registry save is atomic.
  if (oldGroup) lib.filter(n => n.readingGroup === oldGroup).forEach(clearReadingGroup);
  selected.forEach((book, index) => Object.assign(book, {readingGroup: id, readingOrder: index + 1, partType: parts[index].type}));
}
export function pruneReadingGroups(registry) {
  const lib = registry.lib || [];
  lib.forEach(book => { if (book.readingGroup && readingParts(lib, book).length < 2) clearReadingGroup(book); });
}
