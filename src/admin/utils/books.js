import { cz } from './format.js';
import { persistableCover } from './cover.js';

export function slugify(value) {
  return cz().slugify ? cz().slugify(value) : String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function teaser(text, limit = 220) {
  return cz().teaser ? cz().teaser(text, limit) : String(text || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

export function textToHtml(text) {
  const raw = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return '';
  return raw.split(/\n{2,}/).map((part) => '<p>' + part.trim().replace(/\n/g, ' ').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>').filter((p) => p !== '<p></p>').join('\n');
}

export function slideSlug(item) {
  return typeof item === 'string' ? item : item && item.slug;
}

export function cloneRegistry(registry) {
  return JSON.parse(JSON.stringify(registry || { lib: [] }));
}

export function touchRegistry(registry, note = 'sửa từ trang quản trị ssochuz v2') {
  registry.rev = new Date().toISOString().slice(0, 16).replace('T', ' ');
  registry.source = { synced: new Date().toISOString(), note };
  return registry;
}

export const COMPLETION_STATUSES = ['Đang cập nhật', 'Hoàn thành', 'Sắp ra mắt'];
export const PUB_STATUSES = [
  { id: 'draft', label: 'Nháp' },
  { id: 'pending_review', label: 'Chờ duyệt' },
  { id: 'approved', label: 'Đã duyệt' },
  { id: 'scheduled', label: 'Hẹn giờ' },
  { id: 'published', label: 'Xuất bản' },
  { id: 'rejected', label: 'Từ chối' },
  { id: 'archived', label: 'Lưu trữ' },
];
export const VISIBILITIES = [
  { id: 'public', label: 'Công khai' },
  { id: 'unlisted', label: 'Không liệt kê (chỉ link)' },
  { id: 'private', label: 'Riêng tư' },
];

export function pubLabel(id) {
  const hit = PUB_STATUSES.find((x) => x.id === id);
  return (hit && hit.label) || 'Xuất bản';
}

export function renameReferences(registry, oldSlug, newSlug) {
  if (!registry || oldSlug === newSlug) return registry;
  if (Array.isArray(registry.slides)) {
    registry.slides = registry.slides.map((item) => {
      const slug = slideSlug(item);
      if (slug !== oldSlug) return item;
      return item && typeof item === 'object' ? Object.assign({}, item, { slug: newSlug }) : newSlug;
    });
  }
  if (Array.isArray(registry.editorChoice)) {
    registry.editorChoice = registry.editorChoice.map((item) => {
      const slug = typeof item === 'string' ? item : item && item.slug;
      if (slug !== oldSlug) return item;
      return item && typeof item === 'object' ? Object.assign({}, item, { slug: newSlug }) : newSlug;
    });
  }
  if (registry.settings && Array.isArray(registry.settings.editorChoice)) {
    registry.settings.editorChoice = registry.settings.editorChoice.map((item) => {
      const slug = typeof item === 'string' ? item : item && item.slug;
      if (slug !== oldSlug) return item;
      return item && typeof item === 'object' ? Object.assign({}, item, { slug: newSlug }) : newSlug;
    });
  }
  if (registry.schedule && Array.isArray(registry.schedule.items)) {
    registry.schedule.items = registry.schedule.items.map((item) => (item && item.slug === oldSlug ? Object.assign({}, item, { slug: newSlug }) : item));
  }
  return registry;
}

export function removeBookReferences(registry, slug) {
  if (!registry) return registry;
  registry.lib = (registry.lib || []).filter((book) => book.slug !== slug);
  registry.slides = (registry.slides || []).filter((item) => slideSlug(item) !== slug);
  registry.editorChoice = (registry.editorChoice || []).filter((item) => (typeof item === 'string' ? item : item && item.slug) !== slug);
  if (registry.settings && Array.isArray(registry.settings.editorChoice)) {
    registry.settings.editorChoice = registry.settings.editorChoice.filter((item) => (typeof item === 'string' ? item : item && item.slug) !== slug);
  }
  if (registry.schedule && Array.isArray(registry.schedule.items)) {
    registry.schedule.items = registry.schedule.items.filter((item) => (item && item.slug) !== slug);
  }
  return registry;
}

export function metaFromForm(book, values) {
  const out = Object.assign({}, book);
  out.title = values.title || out.title || '';
  out.slug = values.slug || out.slug || '';
  out.author = values.author || '';
  out.couple = values.couple || '';
  out.year = values.year || '';
  out.status = values.status || 'Đang cập nhật';
  out.countLabel = values.countLabel || out.countLabel || '0/—';
  out.is18 = values.is18 === true || values.is18 === '1';
  out.updated = values.updated || today();
  out.thumb = persistableCover(values.thumb || '');
  out.slide = out.thumb;
  out.coverAlt = String(values.coverAlt || values.cover_alt || out.coverAlt || '').trim().slice(0, 120);
  out.synFull = values.synopsis || '';
  out.syn = teaser(values.synopsis || out.synFull || out.syn || '', 220);
  out.genre = String(values.genre || '').trim();
  out.pubStatus = values.pubStatus || out.pubStatus || 'published';
  out.visibility = values.visibility || out.visibility || 'public';
  out.publishedAt = values.publishedAt || out.publishedAt || '';
  if (out.pubStatus !== 'scheduled') {
    /* giữ publishedAt nếu đã xuất bản; xoá lịch tương lai khi không còn hẹn giờ */
    if (out.pubStatus === 'published' && !out.publishedAt) out.publishedAt = today();
  }
  delete out.tags;
  return out;
}

export function newBookRecord(values) {
  const slug = slugify(values.slug || values.title);
  const firstChapter = String(values.chapter || '').trim();
  const chapters = firstChapter ? [{ t: 'Chương 1', html: textToHtml(firstChapter), status: 'published' }] : [];
  const meta = metaFromForm({}, {
    title: String(values.title || '').trim(), slug,
    author: String(values.author || '').trim(), couple: String(values.couple || '').trim(),
    year: String(values.year || '').trim() || String(new Date().getFullYear()),
    status: values.status || (chapters.length ? 'Đang cập nhật' : 'Sắp ra mắt'),
    countLabel: chapters.length ? '1/1' : '0/—',
    is18: values.is18, updated: today(), thumb: String(values.thumb || '').trim(),
    synopsis: String(values.synopsis || '').trim(),
    genre: values.genre, coverAlt: values.coverAlt,
    pubStatus: values.pubStatus || 'draft',
    visibility: values.visibility || 'public',
    publishedAt: values.publishedAt || '',
  });
  meta.chapters = chapters.length;
  const book = { title: meta.title, slug, author: meta.author, couple: meta.couple, chapters };
  return { meta, book };
}
