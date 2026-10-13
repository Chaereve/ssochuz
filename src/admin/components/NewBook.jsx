import { h } from 'preact';
import { useState } from 'preact/hooks';
import { slugify, COMPLETION_STATUSES, PUB_STATUSES, VISIBILITIES, formatCouples, allCouplesFromRegistry } from '../utils/books.js';
import { ImageUploader } from './ImageUploader.jsx';
import { persistableCover } from '../utils/cover.js';

// Thêm bộ kiểu Wattpad: không có thể loại/tag. Bìa + xem trước ở cột trái, thông tin ở cột phải.
const EMPTY_FORM = {
  aliases: '', title: '', slug: '', author: '', couple: '', couples: [''], year: '', status: 'Đang cập nhật',
  is18: '0', thumb: '', coverAlt: '', synopsis: '', chapter: '',
  pubStatus: 'published', visibility: 'public', publishedAt: '',
};

export function NewBook({ registry, onCreate, onUploadImage, apiBase = '', writeBlocked = false, online = false }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const knownCouples = allCouplesFromRegistry(registry);
  const preview = slugify(form.slug || form.title);
  function reset() { setForm(EMPTY_FORM); }
  function update(key, value) { setForm((cur) => Object.assign({}, cur, { [key]: value })); }
  function updateCouples(nextList) {
    const arr = Array.isArray(nextList) && nextList.length ? nextList : [''];
    setForm((cur) => Object.assign({}, cur, {
      couples: arr,
      couple: formatCouples(arr),
    }));
  }
  const coupleRows = Array.isArray(form.couples) && form.couples.length ? form.couples : [''];

  async function submit(e) {
    e.preventDefault();
    if (writeBlocked) return;
    setBusy(true);
    try {
      const ok = await onCreate(Object.assign({}, form, { thumb: persistableCover(form.thumb) }));
      if (ok) setForm(EMPTY_FORM);
    } finally { setBusy(false); }
  }

  return (
    <div class="v2pane">
      <form id="pane-new" class="v2nb" onSubmit={submit}>
        <div class="v2nb-main">
          <section class="v2fsec" aria-labelledby="nb-info-h">
            <h3 id="nb-info-h">Thông tin truyện</h3>
            <label class="fl">Tên truyện <span class="req" aria-hidden="true">*</span>
              <input class="inp v2nb-title" value={form.title} required placeholder="Nhập tên truyện" onInput={(e) => update('title', e.target.value)} />
            </label>
            <p class="v2nb-slug">Đường dẫn: <code>{preview ? '/truyen/' + preview + '/' : '—'}</code></p>
            <div class="v2nb-grid3">
              <label class="fl">Tên khác (mỗi dòng một tên)<textarea class="inp ta" aria-label="Tên khác" value={form.aliases} onInput={e => update('aliases', e.target.value)} /></label>
              <p class="hint">Sau khi tạo truyện, vào Sửa metadata để liên kết các phần và xếp thứ tự đọc.</p>
              <label class="fl">Tác giả<input class="inp" value={form.author} onInput={(e) => update('author', e.target.value)} /></label>
              <div class="fl v2couple-field">
                <div class="v2couple-head">
                  <span>Couple</span>
                  <button
                    type="button"
                    class="btn ghost sm v2couple-add"
                    onClick={() => updateCouples(coupleRows.concat(['']))}
                  >
                    + Thêm couple
                  </button>
                </div>
                <div class="v2couple-list">
                  {coupleRows.map((cp, idx) => (
                    <div class="v2couple-row" key={idx}>
                      <input
                        class="inp v2couple-inp"
                        list="v2-new-couples"
                        aria-label={coupleRows.length > 1 ? ('Couple ' + (idx + 1)) : 'Couple'}
                        value={cp}
                        placeholder={idx === 0 ? 'VD: Lingling x Orm' : 'Couple tiếp theo…'}
                        onInput={(e) => {
                          const next = coupleRows.slice();
                          next[idx] = e.target.value;
                          updateCouples(next);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            updateCouples(coupleRows.concat(['']));
                          }
                        }}
                      />
                      {(coupleRows.length > 1 || cp) ? (
                        <button
                          type="button"
                          class="btn ghost sm v2couple-rm"
                          aria-label={'Xoá couple ' + (idx + 1)}
                          title="Xoá couple này"
                          onClick={() => {
                            const next = coupleRows.filter((_, i) => i !== idx);
                            updateCouples(next.length ? next : ['']);
                          }}
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
                {knownCouples.length ? (
                  <datalist id="v2-new-couples">
                    {knownCouples.map((c) => <option key={c} value={c} />)}
                  </datalist>
                ) : null}
              </div>
              <label class="fl">Năm<input class="inp" value={form.year} inputMode="numeric" onInput={(e) => update('year', e.target.value)} /></label>
            </div>
            <label class="fl">Slug (tuỳ chọn)
              <input class="inp" value={form.slug} placeholder="Để trống sẽ tự tạo từ tên truyện" onInput={(e) => update('slug', e.target.value)} />
            </label>
          </section>

          <section class="v2fsec" aria-labelledby="nb-desc-h">
            <div class="v2fsec-head">
              <h3 id="nb-desc-h">Giới thiệu</h3>
              <span class="hint">{form.synopsis.length} ký tự</span>
            </div>
            <label class="fl">
              <textarea class="inp ta v2nb-desc" value={form.synopsis} placeholder="Tóm tắt nội dung để độc giả quyết định có đọc hay không" onInput={(e) => update('synopsis', e.target.value)} />
            </label>
          </section>

          <section class="v2fsec" aria-labelledby="nb-pub-h">
            <h3 id="nb-pub-h">Xuất bản</h3>
            <div class="v2nb-grid3">
              <label class="fl">Tình trạng
                <select class="inp" value={form.status} onChange={(e) => update('status', e.target.value)}>
                  {COMPLETION_STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label class="fl">Trạng thái
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
            <label class="v2switch">
              <input type="checkbox" role="switch" checked={form.is18 === '1'} onChange={(e) => update('is18', e.target.checked ? '1' : '0')} />
              <span class="v2switch-track" aria-hidden="true"></span>
              <span class="v2switch-text"><b>Nội dung 18+</b><span class="hint">Chỉ hiện với độc giả đã xác nhận tuổi.</span></span>
            </label>
          </section>

          <section class="v2fsec" aria-labelledby="nb-ch-h">
            <div class="v2fsec-head">
              <h3 id="nb-ch-h">Chương 1</h3>
              <span class="hint">Tuỳ chọn. Có thể thêm sau trong tab Chương.</span>
            </div>
            <label class="fl">
              <textarea class="inp ta v2nb-chapter" aria-label="Nội dung chương đầu tiên (tuỳ chọn)" value={form.chapter} onInput={(e) => update('chapter', e.target.value)} />
            </label>
          </section>
        </div>

        <aside class="v2nb-side" aria-label="Bìa truyện">
          <section class="v2fsec v2nb-cover" aria-labelledby="nb-cover-h">
            <h3 id="nb-cover-h">Ảnh bìa</h3>
            <div class="v2preview" aria-label="Xem trước thẻ truyện">
              <div class="v2preview-cover">{form.thumb ? <img src={form.thumb} alt="" /> : <span>Chưa có bìa</span>}</div>
              <div class="v2preview-body">
                <b title={form.title}>{form.title || 'Tên truyện'}</b>
                <span class="v2preview-author">{form.author || 'Tác giả'}</span>
              </div>
            </div>
            <ImageUploader
              value={form.thumb}
              altValue={form.coverAlt}
              onChange={(url) => update('thumb', persistableCover(url))}
              onAltChange={(v) => update('coverAlt', v)}
              onUpload={onUploadImage}
              apiBase={apiBase}
              label="Chọn ảnh"
            />
          </section>
        </aside>

        <div class="v2nb-bar">
          <p class="hint">{online
            ? 'Đang nối Worker: tạo truyện sẽ ghi ngay vào kho và registry.'
            : 'Chưa nối Worker: bộ truyện chỉ lưu trong phiên này.'}</p>
          <div class="v2nb-actions">
            <button type="button" class="btn ghost" onClick={reset} disabled={busy}>Xoá nháp</button>
            <button class="btn pri" disabled={busy || writeBlocked}>{writeBlocked ? 'Hết quota KV' : (busy ? 'Đang tạo…' : 'Tạo truyện')}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
