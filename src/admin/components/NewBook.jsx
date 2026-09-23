import { h } from 'preact';
import { useState } from 'preact/hooks';
import { slugify, COMPLETION_STATUSES, PUB_STATUSES, VISIBILITIES } from '../utils/books.js';
import { ImageUploader } from './ImageUploader.jsx';
import { persistableCover } from '../utils/cover.js';

export function NewBook({ registry, onCreate, onUploadImage, apiBase = '', writeBlocked = false, online = false }) {
  const [form, setForm] = useState({
    title: '', slug: '', author: '', couple: '', year: '', status: 'Đang cập nhật',
    is18: '0', thumb: '', coverAlt: '', synopsis: '', chapter: '', genre: '',
    pubStatus: 'draft', visibility: 'public', publishedAt: '',
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
        pubStatus: 'draft', visibility: 'public', publishedAt: '',
      });
    } finally { setBusy(false); }
  }

  return (
    <div class="v2pane">
    <form id="pane-new" class="v2form" onSubmit={submit}>
      <label class="fl">Tên truyện<input class="inp" value={form.title} required onInput={(e) => update('title', e.target.value)} /></label>
      <p class="hint">slug: <code>{preview ? '/truyen/' + preview + '/' : '—'}</code></p>
      <label class="fl">Slug (tuỳ chọn)<input class="inp" value={form.slug} onInput={(e) => update('slug', e.target.value)} /></label>
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
      {form.pubStatus === 'scheduled' ? (
        <label class="fl">Ngày giờ xuất bản
          <input class="inp" type="datetime-local" value={form.publishedAt} onInput={(e) => update('publishedAt', e.target.value)} />
        </label>
      ) : null}
      <label class="chk"><input type="checkbox" checked={form.is18 === '1'} onChange={(e) => update('is18', e.target.checked ? '1' : '0')} /> 18+</label>
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
      <label class="fl">Chương 1 (tuỳ chọn)<textarea class="inp ta" value={form.chapter} onInput={(e) => update('chapter', e.target.value)} /></label>
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
