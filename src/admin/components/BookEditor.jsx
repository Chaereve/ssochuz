import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { slugify, COMPLETION_STATUSES, PUB_STATUSES, VISIBILITIES } from '../utils/books.js';
import { ChapterEditor } from './ChapterEditor.jsx';
import { ImageUploader } from './ImageUploader.jsx';
import { persistableCover } from '../utils/cover.js';
import { BookBadges } from './Badges.jsx';

export function BookEditor({ registry, slug, bookData, bookLoading, apiBase, onLoadBook, onSave, onSaveBook, onUploadImage, onLock, onUnlock, onDuplicate, onBack, onDelete, writeBlocked = false, online = false }) {
  const book = ((registry && registry.lib) || []).find((item) => item.slug === slug);
  const [form, setForm] = useState({
    title: '', slug: '', author: '', couple: '', year: '', status: 'Đang cập nhật',
    is18: false, thumb: '', coverAlt: '', synopsis: '', genre: '',
    pubStatus: 'published', visibility: 'public', publishedAt: '',
  });
  const [lockPw, setLockPw] = useState('');
  const [lockPw2, setLockPw2] = useState('');
  const [lockBusy, setLockBusy] = useState(false);
  useEffect(() => {
    if (!book) return;
    setForm({
      title: book.title || '', slug: book.slug || '', author: book.author || '', couple: book.couple || '',
      year: book.year || '', status: book.status || 'Đang cập nhật', is18: !!book.is18,
      thumb: persistableCover(book.thumb || book.slide || ''),
      coverAlt: book.coverAlt || '',
      synopsis: book.synFull || book.syn || '',
      genre: book.genre || '',
      pubStatus: book.pubStatus || 'published',
      visibility: book.visibility || 'public',
      publishedAt: book.publishedAt || '',
    });
    setLockPw('');
    setLockPw2('');
  }, [slug]);
  useEffect(() => { if (slug && onLoadBook) onLoadBook(slug); }, [slug]);
  if (!book) return <div id="pane-edit" class="empty">Chưa chọn bộ. Vào tab Thư viện rồi bấm Sửa.</div>;
  function update(key, value) { setForm((cur) => Object.assign({}, cur, { [key]: value })); }
  async function saveLock(e) {
    e.preventDefault();
    setLockBusy(true);
    try {
      if (lockPw !== lockPw2) throw new Error('Hai ô mật mã chưa khớp.');
      await onLock(book.slug, lockPw);
      setLockPw(''); setLockPw2('');
    }
    finally { setLockBusy(false); }
  }
  const blocked = writeBlocked || (!online);

  return (
    <div id="pane-edit">
      <div class="row"><button class="btn ghost sm" type="button" onClick={onBack}>← Thư viện</button></div>
      <div class="v2edit-head">
        <h3 style={{ margin: 0 }}>Sửa metadata: {book.title}</h3>
        <BookBadges book={book} />
      </div>
      <form class="v2form" onSubmit={(e) => { e.preventDefault(); onSave(book.slug, Object.assign({}, form, { slug: slugify(form.slug || form.title), is18: form.is18 ? '1' : '0', thumb: persistableCover(form.thumb) })); }}>
        <label class="fl">Tên<input class="inp" value={form.title} onInput={(e) => update('title', e.target.value)} /></label>
        <label class="fl">Slug<input class="inp" value={form.slug} onInput={(e) => update('slug', e.target.value)} /></label>
        <label class="fl">Tác giả<input class="inp" value={form.author} onInput={(e) => update('author', e.target.value)} /></label>
        <label class="fl">Couple<input class="inp" value={form.couple} onInput={(e) => update('couple', e.target.value)} /></label>
        <label class="fl">Năm<input class="inp" value={form.year} onInput={(e) => update('year', e.target.value)} /></label>
        <div class="row">
          <label class="fl">Tình trạng hoàn thành
            <select class="inp" value={form.status} onChange={(e) => update('status', e.target.value)}>
              {COMPLETION_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label class="fl">Trạng thái xuất bản
            <select class="inp" value={form.pubStatus} onChange={(e) => update('pubStatus', e.target.value)}>
              {PUB_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          <label class="fl">Hiển thị
            <select class="inp" value={form.visibility} onChange={(e) => update('visibility', e.target.value)}>
              {VISIBILITIES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
        </div>
        <p class="hint">Tình trạng hoàn thành (Đang cập nhật / Hoàn thành / Sắp ra mắt) khác trạng thái xuất bản (nháp, chờ duyệt, hẹn giờ, xuất bản, lưu trữ).</p>
        {form.pubStatus === 'scheduled' ? (
          <label class="fl">Hẹn giờ xuất bản
            <input class="inp" type="datetime-local" value={form.publishedAt} onInput={(e) => update('publishedAt', e.target.value)} />
          </label>
        ) : null}
        <label class="chk"><input type="checkbox" checked={form.is18} onChange={(e) => update('is18', e.target.checked)} /> 18+</label>
        <ImageUploader
          value={form.thumb}
          altValue={form.coverAlt}
          onChange={(url) => update('thumb', persistableCover(url))}
          onAltChange={(v) => update('coverAlt', v)}
          onUpload={onUploadImage}
          apiBase={apiBase}
          label="Ảnh bìa"
        />
        <label class="fl">Tóm tắt<textarea class="inp ta" value={form.synopsis} onInput={(e) => update('synopsis', e.target.value)} /></label>
        <div class="row sticky-actions">
          <button class="btn pri" type="submit" disabled={writeBlocked}>{writeBlocked ? 'Hết quota KV' : (online ? 'Lưu metadata' : 'Lưu nháp phiên')}</button>
          {!online ? <span class="sm muted">Chế độ tĩnh — chưa ghi Cloudflare KV.</span> : null}
        </div>
      </form>
      <form class="v2form v2lock-panel" onSubmit={saveLock}>
        <h3>Khóa mật mã</h3>
        <p class="hint">{book.lock ? 'Bộ này đang khóa. Nhập mật mã mới để đổi, hoặc bỏ khóa.' : 'Đặt mật mã thì thẻ vẫn công khai, chương chỉ mở khi nhập đúng.'}</p>
        {!online ? <p class="hint">Khóa mật mã cần nối Worker bằng ADMIN_KEY. Ở chế độ tĩnh không ghi KV.</p> : null}
        <label class="fl">Mật mã (tối thiểu 8 ký tự)<input class="inp" type="password" value={lockPw} onInput={(e) => setLockPw(e.target.value)} autocomplete="new-password" /></label>
        <label class="fl">Nhập lại mật mã<input class="inp" type="password" value={lockPw2} onInput={(e) => setLockPw2(e.target.value)} autocomplete="new-password" /></label>
        <div class="row">
          <button class="btn" disabled={lockBusy || lockPw.length < 8 || blocked} type="button" onClick={saveLock}>Đặt / đổi mật mã</button>
          {book.lock ? <button class="btn ghost" type="button" disabled={lockBusy || blocked} onClick={() => onUnlock(book.slug)}>Bỏ khóa</button> : null}
        </div>
      </form>
      <ChapterEditor slug={slug} book={bookData} loading={bookLoading} apiBase={apiBase} onSaveBook={onSaveBook} onUploadImage={onUploadImage} writeBlocked={writeBlocked} online={online} />
      <section class="v2danger">
        <h3>Khu vực nguy hiểm</h3>
        <p class="hint">Nhân bản tạo slug mới và tự bỏ khóa trên bản sao. Xoá bộ cần gõ đúng slug; book key và registry đều bị ảnh hưởng.</p>
        <div class="row">
          <button class="btn ghost sm" type="button" disabled={writeBlocked} onClick={() => onDuplicate && onDuplicate(book.slug)}>Nhân bản bộ</button>
          <button class="btn ghost sm danger" type="button" disabled={writeBlocked} onClick={() => onDelete(book.slug)}>Xoá bộ</button>
        </div>
      </section>
    </div>
  );
}
