import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { slugify, allTags } from '../utils/books.js';
import { TagsField } from './TagsField.jsx';
import { ChapterEditor } from './ChapterEditor.jsx';

const emptyForm = { title: '', slug: '', author: '', couple: '', year: '', status: 'Đang cập nhật', countLabel: '', is18: '0', updated: '', thumb: '', synopsis: '' };

function formFromBook(book) {
  if (!book) return emptyForm;
  return {
    title: book.title || '', slug: book.slug || '', author: book.author || '', couple: book.couple || '',
    year: book.year || '', status: book.status || 'Đang cập nhật', countLabel: book.countLabel || '',
    is18: book.is18 ? '1' : '0', updated: book.updated || '', thumb: book.thumb || '',
    synopsis: book.synFull || book.syn || '',
    tags: Array.isArray(book.tags) ? book.tags.join(', ') : '',
  };
}

export function BookEditor({ registry, slug, bookData, bookLoading, apiBase, onLoadBook, onSave, onSaveBook, onUploadImage, onLock, onUnlock, onDuplicate, onBack, onDelete }) {
  const book = ((registry && registry.lib) || []).find((item) => item.slug === slug) || null;
  const [form, setForm] = useState(formFromBook(book));
  const [coverBusy, setCoverBusy] = useState(false);
  const [lockPw, setLockPw] = useState('');
  const [lockPw2, setLockPw2] = useState('');
  const coverRef = useRef(null);
  useEffect(() => setForm(formFromBook(book)), [slug, book && book.title]);
  if (!book) {
    return <div id="pane-edit" class="v2pane"><section class="card2"><h3>Chưa chọn bộ</h3><p class="hint">Chọn một bộ trong tab Thư viện để sửa metadata.</p><button class="btn ghost" type="button" onClick={onBack}>Về thư viện</button></section></div>;
  }
  const update = (key, value) => setForm((prev) => Object.assign({}, prev, { [key]: value }));
  const uploadCover = async (file) => {
    if (!file || !onUploadImage) return;
    setCoverBusy(true);
    try {
      const url = await onUploadImage(file, { max: 900, quality: 0.84 });
      if (url) update('thumb', url);
    } catch (error) {
      if (window.CZ && window.CZ.toast) window.CZ.toast('Upload bìa lỗi: ' + (error.message || error), 'err');
    } finally { setCoverBusy(false); }
  };
  const submitLock = () => {
    if (lockPw !== lockPw2) { window.CZ && window.CZ.toast ? window.CZ.toast('Hai ô mật mã chưa khớp.', 'err') : alert('Hai ô mật mã chưa khớp.'); return; }
    if (onLock) onLock(book.slug, lockPw).then(() => { setLockPw(''); setLockPw2(''); }).catch(() => {});
  };
  const nextSlug = slugify(form.slug || form.title || book.slug);
  const duplicate = nextSlug !== book.slug && !!((registry && registry.lib) || []).find((item) => item.slug === nextSlug);
  const submit = (event) => {
    event.preventDefault();
    onSave(book.slug, Object.assign({}, form, { slug: nextSlug, is18: form.is18 === '1' }));
  };
  return (
    <div id="pane-edit" class="v2pane">
      <section class="card2">
        <div class="row"><h3>Sửa metadata: {book.title}</h3><span class="grow"></span><button class="btn ghost sm" type="button" onClick={() => onDuplicate && onDuplicate(book.slug)}>Nhân bản bộ</button><a class="btn ghost sm" href={(window.CZ && window.CZ.storyURL ? window.CZ.storyURL(book.slug) : '/truyen/' + book.slug + '/')} target="_blank" rel="noreferrer">Mở trang thông tin ↗</a><button class="btn ghost sm" type="button" onClick={onBack}>← Về thư viện</button></div>
        <p class="hint">Metadata lưu cùng registry. Bên dưới là trình soạn chương TipTap; output vẫn là HTML trong shape cũ <code>chapters[].html</code>.</p>
        <form onSubmit={submit}>
          <div class="v2edit-grid">
            <div class="v2cover-preview">
              <div class={`coverbox ${form.thumb ? '' : 'empty'}`}>{form.thumb ? <img src={form.thumb} alt="" /> : <span>Chưa có ảnh bìa</span>}</div>
              {book.lock ? <span class="pill acc">🔒 đang khóa mật mã</span> : <span class="pill">chưa khóa</span>}
              <input ref={coverRef} class="hide" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => uploadCover(e.currentTarget.files && e.currentTarget.files[0])} />
              <button class="btn ghost sm" type="button" disabled={coverBusy} onClick={() => coverRef.current && coverRef.current.click()}>{coverBusy ? 'Đang nén bìa…' : 'Upload bìa'}</button>
              <p class="hint">Ảnh upload sẽ nén trên máy rồi lưu qua <code>/api/img</code>.</p>
            </div>
            <div>
              <div class="grid2">
                <div><label class="fl">Tên truyện</label><input class="inp" value={form.title} onInput={(e) => update('title', e.currentTarget.value)} required /></div>
                <div><label class="fl">Slug</label><input class="inp" value={form.slug} onInput={(e) => update('slug', e.currentTarget.value)} /><p class={`hint ${duplicate ? 'errtxt' : ''}`}>URL: <code>/truyen/{nextSlug || '...'}/</code>{duplicate ? ' — slug đã tồn tại' : nextSlug !== book.slug ? ' — sẽ đổi đường dẫn và chuyển book KV' : ''}</p></div>
                <div><label class="fl">Tác giả</label><input class="inp" value={form.author} onInput={(e) => update('author', e.currentTarget.value)} /></div>
                <div><label class="fl">Couple</label><input class="inp" value={form.couple} onInput={(e) => update('couple', e.currentTarget.value)} /></div>
                <div><label class="fl">Năm</label><input class="inp" value={form.year} onInput={(e) => update('year', e.currentTarget.value)} /></div>
                <div><label class="fl">Tình trạng</label><select class="inp" value={form.status} onChange={(e) => update('status', e.currentTarget.value)}><option>Đang cập nhật</option><option>Hoàn thành</option><option>Sắp ra mắt</option></select></div>
                <div><label class="fl">Nhãn số chương</label><input class="inp" value={form.countLabel} onInput={(e) => update('countLabel', e.currentTarget.value)} placeholder="29/29" /></div>
                <div><label class="fl">18+</label><select class="inp" value={form.is18} onChange={(e) => update('is18', e.currentTarget.value)}><option value="0">Không</option><option value="1">Có</option></select></div>
                <div><label class="fl">Ngày cập nhật</label><input class="inp" type="date" value={form.updated} onInput={(e) => update('updated', e.currentTarget.value)} /></div>
                <div><label class="fl">Ảnh bìa</label><input class="inp" value={form.thumb} onInput={(e) => update('thumb', e.currentTarget.value)} /></div>
              </div>
              <label class="fl">Tags (thể loại/chất truyện)</label>
              <TagsField value={form.tags} suggestions={allTags(registry)} onChange={(tags) => update('tags', tags)} />
              <label class="fl">Mô tả</label><textarea class="inp" value={form.synopsis} onInput={(e) => update('synopsis', e.currentTarget.value)} style="min-height:130px" />
            </div>
          </div>
          <div class="savebar"><button class="btn pri" type="submit" disabled={!nextSlug || duplicate}>Lưu metadata</button><button class="btn ghost danger" type="button" onClick={() => onDelete(book.slug)}>Xoá bộ</button></div>
        </form>
      </section>
      <section class="card2 v2lock-panel">
        <div class="row"><h3>Khóa mật mã</h3><span class="grow"></span><span class={book.lock ? 'pill acc' : 'pill'}>{book.lock ? 'đang có mật mã' : 'chưa khóa'}</span></div>
        <p class="hint">Card truyện vẫn công khai, nhưng danh sách chương chỉ mở khi độc giả nhập đúng mật mã. Mật mã không lưu trong registry.</p>
        <div class="grid2">
          <div><label class="fl">Mật mã mới</label><input class="inp" type="password" value={lockPw} onInput={(e) => setLockPw(e.currentTarget.value)} placeholder="tối thiểu 8 ký tự" /></div>
          <div><label class="fl">Nhập lại mật mã</label><input class="inp" type="password" value={lockPw2} onInput={(e) => setLockPw2(e.currentTarget.value)} /></div>
        </div>
        <div class="row mt"><button class="btn pri sm" type="button" onClick={submitLock} disabled={!lockPw || lockPw.length < 8}>Đặt / đổi mật mã</button><button class="btn ghost sm danger" type="button" onClick={() => onUnlock && onUnlock(book.slug)}>Bỏ khóa</button></div>
      </section>
      <ChapterEditor slug={book.slug} book={bookData} loading={bookLoading} apiBase={apiBase} onLoad={() => onLoadBook && onLoadBook(book.slug)} onSaveBook={onSaveBook} onUploadImage={onUploadImage} />
    </div>
  );
}
