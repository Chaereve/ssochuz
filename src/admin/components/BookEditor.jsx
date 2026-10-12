import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { slugify, COMPLETION_STATUSES, PUB_STATUSES, VISIBILITIES, parseCouples, formatCouples, allCouplesFromRegistry } from '../utils/books.js';
import { ChapterEditor } from './ChapterEditor.jsx';
import { ImageUploader } from './ImageUploader.jsx';
import { persistableCover } from '../utils/cover.js';
import { BookBadges } from './Badges.jsx';

export function BookEditor({ registry, slug, bookData, bookLoading, bookError, apiBase, onLoadBook, onSave, onSaveBook, onSaveChapter, onDeleteChapter, onMoveChapter, onUploadImage, onLock, onUnlock, onDuplicate, onBack, onDelete, writeBlocked = false, online = false, shortcuts }) {
  const book = ((registry && registry.lib) || []).find((item) => item.slug === slug);
  const knownCouples = allCouplesFromRegistry(registry);
  const metaFormRef = useRef(null);
  const [form, setForm] = useState({
    title: '', slug: '', author: '', couple: '', couples: [''], year: '', status: 'Đang cập nhật',
    is18: false, thumb: '', coverAlt: '', synopsis: '', genre: '',
    pubStatus: 'published', visibility: 'public', publishedAt: '',
  });
  const [lockPw, setLockPw] = useState('');
  const [lockPw2, setLockPw2] = useState('');
  const [lockBusy, setLockBusy] = useState(false);
  const [tab, setTab] = useState('info');
  useEffect(() => {
    if (!book) return;
    const parsedCouples = parseCouples(book);
    setForm({
      title: book.title || '', slug: book.slug || '', author: book.author || '',
      couple: formatCouples(parsedCouples),
      couples: parsedCouples.length ? parsedCouples : [''],
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
  useEffect(() => { if (slug && onLoadBook) onLoadBook(slug, true); }, [slug]);

  /* Ctrl+S: lưu metadata khi focus nằm trong form metadata (không phải ở khóa
     mật mã / trình soạn chương / các nơi khác). ChapterEditor đăng ký sau
     nên được gọi trước; nếu focus ngoài khối chương thì handler này chạy. */
  useEffect(() => {
    if (!shortcuts || !shortcuts.registerSave) return;
    const handler = () => {
      const formEl = metaFormRef.current;
      if (!formEl) return false;
      const ae = document.activeElement;
      /* không ăn phím khi đang ở trong khóa mật mã hay chapter editor */
      if (ae) {
        const lock = formEl.parentElement && formEl.parentElement.querySelector('.v2lock-panel');
        if (lock && lock.contains(ae)) return false;
        const chapter = formEl.parentElement && formEl.parentElement.querySelector('.v2chapter-editor');
        if (chapter && chapter.contains(ae)) return false;
        /* ngoài form metadata thì không tự submit (vd. focus trên sidebar/topbar) */
        if (!formEl.contains(ae)) return false;
      }
      const btn = formEl.querySelector('button[type="submit"]');
      if (btn && !btn.disabled) { btn.click(); return true; }
      return false;
    };
    shortcuts.registerSave(handler);
    return () => shortcuts.unregisterSave && shortcuts.unregisterSave(handler);
  }, [shortcuts, slug]);

  if (!book) return <div id="pane-edit" class="empty">Chưa chọn bộ. Vào tab Thư viện rồi bấm Sửa.</div>;
  function update(key, value) { setForm((cur) => Object.assign({}, cur, { [key]: value })); }
  function updateCouples(nextList) {
    const arr = Array.isArray(nextList) && nextList.length ? nextList : [''];
    setForm((cur) => Object.assign({}, cur, {
      couples: arr,
      couple: formatCouples(arr),
    }));
  }
  const coupleRows = Array.isArray(form.couples) && form.couples.length ? form.couples : [''];
  async function saveLock(e) {
    e.preventDefault();
    setLockBusy(true);
    try {
      if (lockPw !== lockPw2) throw new Error('Hai ô mật mã chưa khớp.');
      await onLock(book.slug, lockPw);
      setLockPw(''); setLockPw2('');
    }
    catch (err) {
      /* onLock (main) tự toast lỗi của nó; lỗi cục bộ (chưa khớp) phải tự báo —
         không để rejection bỏ hoang làm crash trang (hồi quy bởi t_sweep). */
      const m = (err && err.message) || String(err);
      if (/chưa khớp/i.test(m)) (window.CZ && window.CZ.toast ? window.CZ.toast(m, 'err') : alert(m));
    }
    finally { setLockBusy(false); }
  }
  const blocked = writeBlocked || (!online);

  return (
    <div id="pane-edit" class="v2edit">
      <div class="v2edit-top">
        <button class="btn ghost sm" type="button" onClick={onBack}>← Thư viện</button>
        <div class="v2edit-title">
          <h3>Sửa metadata: {book.title}</h3>
          <BookBadges book={book} />
        </div>
      </div>
      <div class="v2tabs" role="tablist" aria-label="Khu vực sửa bộ truyện">
        <button type="button" role="tab" id="tab-info" aria-selected={tab === 'info'} aria-controls="pane-info" class={'v2tab' + (tab === 'info' ? ' on' : '')} onClick={() => setTab('info')}>Thông tin</button>
        <button type="button" role="tab" id="tab-chapters" aria-selected={tab === 'chapters'} aria-controls="pane-chapters" class={'v2tab' + (tab === 'chapters' ? ' on' : '')} onClick={() => setTab('chapters')}>Chương</button>
      </div>
      <div id="pane-info" role="tabpanel" aria-labelledby="tab-info" class="v2tabpane" hidden={tab !== 'info'}>
        <form class="v2form" ref={metaFormRef} onSubmit={(e) => { e.preventDefault(); onSave(book.slug, Object.assign({}, form, { slug: slugify(form.slug || form.title), is18: form.is18 ? '1' : '0', thumb: persistableCover(form.thumb) })); }}>
          <section class="v2fsec" aria-label="Thông tin cơ bản">
            <div class="v2fsec-head"><b>Thông tin cơ bản</b><span class="hint">Tên, slug và thông tin tác giả hiển thị trên thẻ truyện.</span></div>
            <label class="fl">Tên<input class="inp" value={form.title} onInput={(e) => update('title', e.target.value)} /></label>
            <label class="fl">Slug<input class="inp" value={form.slug} onInput={(e) => update('slug', e.target.value)} /></label>
            <div class="row v2meta-row">
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
                        list="v2-edit-couples"
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
                  <datalist id="v2-edit-couples">
                    {knownCouples.map((c) => <option key={c} value={c} />)}
                  </datalist>
                ) : null}
              </div>
              <label class="fl">Năm<input class="inp" value={form.year} onInput={(e) => update('year', e.target.value)} /></label>
            </div>
          </section>
          <section class="v2fsec" aria-label="Phân loại và hiển thị">
            <div class="v2fsec-head"><b>Phân loại &amp; hiển thị</b><span class="hint">Tình trạng hoàn thành (Đang cập nhật / Hoàn thành / Sắp ra mắt) khác trạng thái xuất bản (nháp, chờ duyệt, hẹn giờ, xuất bản, lưu trữ).</span></div>
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
              <label class="fl">Hẹn giờ xuất bản
                <input class="inp" type="datetime-local" value={form.publishedAt} onInput={(e) => update('publishedAt', e.target.value)} />
              </label>
            ) : null}
            <label class="v2switch">
              <input type="checkbox" role="switch" checked={form.is18} onChange={(e) => update('is18', e.target.checked)} />
              <span class="v2switch-track" aria-hidden="true"></span>
              <span class="v2switch-text"><b>Nội dung 18+</b><span class="hint">Chỉ hiện với độc giả đã xác nhận tuổi.</span></span>
            </label>
          </section>
          <section class="v2fsec" aria-label="Ảnh bìa">
            <div class="v2fsec-head"><b>Ảnh bìa</b><span class="hint">Bìa dùng chung cho thẻ truyện, slide trang chủ và trang chi tiết.</span></div>
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
          <section class="v2fsec" aria-label="Giới thiệu">
            <div class="v2fsec-head"><b>Giới thiệu</b><span class="hint">Tóm tắt hiển thị ở trang truyện; bản ngắn tự cắt cho thẻ ở thư viện.</span></div>
            <label class="fl">Tóm tắt<textarea class="inp ta" value={form.synopsis} onInput={(e) => update('synopsis', e.target.value)} /></label>
          </section>
          <div class="row sticky-actions">
            <button class="btn pri" type="submit" disabled={writeBlocked} title="Lưu metadata · Ctrl/Cmd+S">{writeBlocked ? 'Hết quota KV' : (online ? 'Lưu metadata' : 'Lưu nháp phiên')}</button>
            {!online ? <span class="sm muted">Chế độ tĩnh: chưa ghi KV.</span> : null}
            <span class="sm muted">Ctrl/Cmd+S để lưu</span>
          </div>
        </form>
        <div class="v2edit-foot">
          <form class="v2form v2lock-panel" onSubmit={saveLock}>
            <h3>Khóa mật mã</h3>
            <p class="hint">{book.lock ? 'Bộ này đang khóa. Nhập mật mã mới để đổi, hoặc bỏ khóa.' : 'Thẻ vẫn công khai; chương chỉ mở khi nhập đúng mật mã.'}</p>
            {!online ? <p class="hint">Cần nối Worker bằng ADMIN_KEY để đặt mật mã.</p> : null}
            <label class="fl">Mật mã (tối thiểu 8 ký tự)<input class="inp" type="password" value={lockPw} onInput={(e) => setLockPw(e.target.value)} autocomplete="new-password" /></label>
            <label class="fl">Nhập lại mật mã<input class="inp" type="password" value={lockPw2} onInput={(e) => setLockPw2(e.target.value)} autocomplete="new-password" /></label>
            <div class="row">
              <button class="btn" disabled={lockBusy || lockPw.length < 8 || blocked} type="button" onClick={saveLock}>Đặt / đổi mật mã</button>
              {book.lock ? <button class="btn ghost" type="button" disabled={lockBusy || blocked} onClick={() => onUnlock(book.slug)}>Bỏ khóa</button> : null}
            </div>
          </form>
          <section class="v2danger">
            <h3>Khu vực nguy hiểm</h3>
            <p class="hint">Nhân bản tạo slug mới và tự bỏ khóa trên bản sao. Xoá bộ cần gõ đúng slug; book key và registry đều bị ảnh hưởng.</p>
            <div class="row">
              <button class="btn ghost sm" type="button" disabled={writeBlocked} onClick={() => onDuplicate && onDuplicate(book.slug)}>Nhân bản bộ</button>
              <button class="btn ghost sm danger" type="button" disabled={writeBlocked} onClick={() => onDelete(book.slug)}>Xoá bộ</button>
            </div>
          </section>
        </div>
      </div>
      <div id="pane-chapters" role="tabpanel" aria-labelledby="tab-chapters" class="v2tabpane" hidden={tab !== 'chapters'}>
        <ChapterEditor slug={slug} book={bookData} loading={bookLoading} loadError={bookError} onLoad={() => onLoadBook && onLoadBook(slug)} apiBase={apiBase} onSaveBook={onSaveBook} onSaveChapter={onSaveChapter} onDeleteChapter={onDeleteChapter} onMoveChapter={onMoveChapter} onUploadImage={onUploadImage} writeBlocked={writeBlocked} online={online} shortcuts={shortcuts} />
      </div>
    </div>
  );
}
