import { h } from 'preact';
import { useMemo, useRef, useState } from 'preact/hooks';
import { slugify } from '../utils/books.js';

export function NewBook({ registry, onCreate, onUploadImage }) {
  const [form, setForm] = useState({ title: '', slug: '', author: '', couple: '', year: '', status: 'Đang cập nhật', is18: '0', thumb: '', synopsis: '', chapter: '' });
  const [coverBusy, setCoverBusy] = useState(false);
  const coverRef = useRef(null);
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
  const slug = useMemo(() => slugify(form.slug || form.title), [form.slug, form.title]);
  const exists = !!((registry && registry.lib) || []).find((book) => book.slug === slug);
  const submit = async (event) => {
    event.preventDefault();
    const ok = onCreate ? await onCreate(Object.assign({}, form, { slug })) : false;
    if (ok) {
      setForm({ title: '', slug: '', author: '', couple: '', year: '', status: 'Đang cập nhật', is18: '0', thumb: '', synopsis: '', chapter: '' });
      if (coverRef.current) coverRef.current.value = '';
    }
  };
  return (
    <div id="pane-new" class="v2pane">
      <section class="card2">
        <h3>Thêm bộ mới</h3>
        <p class="hint">Tạo thẻ truyện mới. Slug được xem trước realtime; nếu nhập chương đầu tiên, admin v2 sẽ tạo luôn bản ghi book trên KV.</p>
        <form onSubmit={submit}>
          <div class="grid2">
            <div><label class="fl">Tên truyện *</label><input class="inp" value={form.title} onInput={(e) => update('title', e.currentTarget.value)} required /></div>
            <div><label class="fl">Slug</label><input class="inp" value={form.slug} onInput={(e) => update('slug', e.currentTarget.value)} placeholder="tu-dong-tao-tu-ten" /><p class={`hint ${exists ? 'errtxt' : ''}`}>URL: <code>/truyen/{slug || '...'}/</code>{exists ? ' — slug đã tồn tại' : ''}</p></div>
            <div><label class="fl">Tác giả</label><input class="inp" value={form.author} onInput={(e) => update('author', e.currentTarget.value)} /></div>
            <div><label class="fl">Couple</label><input class="inp" value={form.couple} onInput={(e) => update('couple', e.currentTarget.value)} /></div>
            <div><label class="fl">Năm</label><input class="inp" value={form.year} onInput={(e) => update('year', e.currentTarget.value)} /></div>
            <div><label class="fl">Tình trạng</label><select class="inp" value={form.status} onChange={(e) => update('status', e.currentTarget.value)}><option>Đang cập nhật</option><option>Hoàn thành</option><option>Sắp ra mắt</option></select></div>
            <div><label class="fl">18+</label><select class="inp" value={form.is18} onChange={(e) => update('is18', e.currentTarget.value)}><option value="0">Không</option><option value="1">Có</option></select></div>
            <div><label class="fl">Ảnh bìa (URL)</label><input class="inp" value={form.thumb} onInput={(e) => update('thumb', e.currentTarget.value)} placeholder="https://…" /></div>
          </div>
          <div class="v2cover-inline">
            <div class={`coverbox ${form.thumb ? '' : 'empty'}`}>{form.thumb ? <img src={form.thumb} alt="" /> : <span>Chưa có ảnh bìa</span>}</div>
            <div><input ref={coverRef} class="hide" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => uploadCover(e.currentTarget.files && e.currentTarget.files[0])} /><button class="btn ghost sm" type="button" disabled={coverBusy} onClick={() => coverRef.current && coverRef.current.click()}>{coverBusy ? 'Đang nén bìa…' : 'Upload bìa'}</button><p class="hint">Dùng cùng endpoint <code>/api/img</code>; không tạo backend mới.</p></div>
          </div>
          <label class="fl">Mô tả</label><textarea class="inp" value={form.synopsis} onInput={(e) => update('synopsis', e.currentTarget.value)} style="min-height:88px" />
          <label class="fl">Chương 1 (không bắt buộc)</label><textarea class="inp" value={form.chapter} onInput={(e) => update('chapter', e.currentTarget.value)} />
          <div class="savebar"><button class="btn pri" type="submit" disabled={!form.title.trim() || !slug || exists}>Tạo bộ</button></div>
        </form>
      </section>
    </div>
  );
}
