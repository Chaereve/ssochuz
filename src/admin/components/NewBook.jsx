import { h } from 'preact';
import { useState } from 'preact/hooks';
import { slugify, COMPLETION_STATUSES, PUB_STATUSES, VISIBILITIES } from '../utils/books.js';
import { ImageUploader } from './ImageUploader.jsx';
import { persistableCover } from '../utils/cover.js';

export function NewBook({ registry, onCreate, onUploadImage, apiBase = '', writeBlocked = false, online = false }) {
  const [form, setForm] = useState({
    title: '', slug: '', author: '', couple: '', year: '', status: 'Đang cập nhật',
    is18: '0', thumb: '', coverAlt: '', synopsis: '', chapter: '', genre: '',
    pubStatus: 'published', visibility: 'public', publishedAt: '',
  });
  const [busy, setBusy] = useState(false);
  const preview = slugify(form.slug || form.title);
  function update(key, value) { setForm((cur) => Object.assign({}, cur, { [key]: value })); }

  async function submit(e) {
    e.preventDefault();
    if (writeBlocked) return;
    setBusy(true);
    try {
      const ok = await onCreate(Object.assign({}, form, { thumb: persistableCover(form.thumb) }));
      if (ok) setForm({
        title: '', slug: '', author: '', couple: '', year: '', status: 'Đang cập nhật',
        is18: '0', thumb: '', coverAlt: '', synopsis: '', chapter: '', genre: '',
        pubStatus: 'published', visibility: 'public', publishedAt: '',
      });
    } finally { setBusy(false); }
  }

  return (
    <div class="v2pane">
    <form id="pane-new" class="v2form" onSubmit={submit}>
      <section class="v2fsec" aria-label="Thông tin cơ bản">
        <div class="v2fsec-head"><b>Thông tin cơ bản</b><span class="hint">Tên truyện là bắt buộc; slug để trống sẽ tự sinh từ tên.</span></div>
        <label class="fl">Tên truyện<input class="inp" value={form.title} required onInput={(e) => update('title', e.target.value)} /></label>
        <p class="hint">slug: <code>{preview ? '/truyen/' + preview + '/' : '—'}</code></p>
        <label class="fl">Slug (tuỳ chọn)<input class="inp" value={form.slug} onInput={(e) => update('slug', e.target.value)} /></label>
        <div class="row">
          <label class="fl">Tác giả<input class="inp" value={form.author} onInput={(e) => update('author', e.target.value)} /></label>
          <label class="fl">Couple<input class="inp" value={form.couple} onInput={(e) => update('couple', e.target.value)} /></label>
          <label class="fl">Năm<input class="inp" value={form.year} onInput={(e) => update('year', e.target.value)} /></label>
        </div>
      </section>
      <section class="v2fsec" aria-label="Phân loại và hiển thị">
        <div class="v2fsec-head"><b>Phân loại &amp; hiển thị</b><span class="hint">Tình trạng hoàn thành khác trạng thái xuất bản; mặc đá»nh Xuáº¥t báº£n â chá»n NhÃ¡p thÃ¬ truyá»n CHá» tháº¥y trong admin, khÃ´ng lÃªn trang chá»§.</span></div>
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
        {form.pubStatus === 'scheduled' ? (
          <label class="fl">Ngày giờ xuất bản
            <input class="inp" type="datetime-local" value={form.publishedAt} onInput={(e) => update('publishedAt', e.target.value)} />
          </label>
        ) : null}
        <label class="chk"><input type="checkbox" checked={form.is18 === '1'} onChange={(e) => update('is18', e.target.checked ? '1' : '0')} /> 18+</label>
      </section>
      <section class="v2fsec" aria-label="Ảnh bìa">
        <div class="v2fsec-head"><b>Ảnh bìa</b><span class="hint">Có thể bỏ qua rồi thêm sau trong tab Sửa bộ.</span></div>
        <ImageUploader
          value={form.thumb}
          altValue={form.coverAlt}
          onChange={(url) => update('thumb', persistableCover(url))}
          onAltChange={(v) => update('coverAlt', v)}
          onUpload={onUploadImage}
          apiBase={apiBase}
          label="Ảnh bìa"
        />
      </section>
      <section class="v2fsec" aria-label="Giới thiệu và chương đầu">
        <div class="v2fsec-head"><b>Giới thiệu &amp; chương đầu</b><span class="hint">Chương 1 là tuỳ chọn — văn bản thường sẽ tự chuyển thành đoạn HTML.</span></div>
        <label class="fl">Tóm tắt<textarea class="inp ta" value={form.synopsis} onInput={(e) => update('synopsis', e.target.value)} /></label>
        <label class="fl">Chương 1 (tuỳ chọn)<textarea class="inp ta" value={form.chapter} onInput={(e) => update('chapter', e.target.value)} /></label>
      </section>
      <p class="hint">{online
        ? 'Khi đang nối Worker, Tạo truyện ghi ngay book JSON + registry — tab Kiểm tra dữ liệu sẽ thấy bộ mới, không chờ thêm bước nào.'
        : 'Chế độ dữ liệu tĩnh: chỉ tạo nháp phiên, chưa ghi Cloudflare KV.'}</p>
      <div class="row sticky-actions">
        <button class="btn pri" disabled={busy || writeBlocked}>{writeBlocked ? 'Hết quota KV' : (busy ? 'Đang tạo…' : 'Tạo truyện')}</button>
      </div>
    </form>
    </div>
  );
}
