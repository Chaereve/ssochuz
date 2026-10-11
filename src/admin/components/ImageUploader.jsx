import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { persistableCover, resolveCover } from '../utils/cover.js';

export function ImageUploader({
  value = '',
  altValue = '',
  onChange,
  onAltChange,
  onUpload,
  apiBase = '',
  label = 'Ảnh bìa',
  hint = 'JPG, PNG, WebP · tối đa 12 MB · tự nén về ~1000px trước khi gửi. Ảnh trùng nội dung được dùng lại, không ghi thêm bản sao.',
  inputId,
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const fileRef = useRef(null);
  const preview = persistableCover(value) ? resolveCover(value, apiBase) : '';
  const showPreview = !!preview && !imgFailed;

  useEffect(() => {
    setError('');
    setImgFailed(false);
  }, [value]);

  async function handleFile(file) {
    if (!file) return;
    setError('');
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type || '')) {
      setError('Chỉ nhận JPG, PNG hoặc WebP.');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setError('Ảnh gốc quá lớn (tối đa 12 MB).');
      return;
    }
    if (!onUpload) {
      setError('Upload ảnh cần nối Worker bằng ADMIN_KEY.');
      return;
    }
    setBusy(true); setProgress(18);
    const tick = setInterval(() => setProgress((p) => Math.min(88, p + 9)), 180);
    try {
      const url = await onUpload(file, { kind: 'cover' });
      const saved = persistableCover(url);
      if (!saved) throw new Error('Worker không trả URL bền — không lưu blob.');
      if (onChange) onChange(saved);
      setProgress(100);
    } catch (e) {
      setError((e && e.message) || String(e));
    } finally {
      clearInterval(tick);
      setBusy(false);
      setTimeout(() => setProgress(0), 500);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function onDrop(e) {
    e.preventDefault(); setDrag(false);
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    handleFile(file);
  }

  const openPicker = () => fileRef.current && fileRef.current.click();
  return (
    <div class="v2up">
      <span class="v2up-label">{label}</span>
      <div
        class={'v2up-drop' + (drag ? ' on' : '') + (busy ? ' busy' : '') + (showPreview ? ' has-img' : '')}
        role="button"
        tabIndex={0}
        aria-label={'Chọn hoặc kéo thả ' + (label || 'ảnh bìa') + ' vào đây'}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={openPicker}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); } }}
      >
        {showPreview
          ? <img class="v2up-preview" src={preview} alt={altValue || 'Xem trước bìa'} onError={() => setImgFailed(true)} />
          : (
            <div class="v2up-empty">
              <span class="v2up-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 15V4" /><path d="m7.5 8.5 4.5-4.5 4.5 4.5" /><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
                </svg>
              </span>
              <b>{imgFailed ? 'Không tải được ảnh từ URL' : 'Kéo thả ảnh vào đây'}</b>
              <span>{imgFailed ? 'Kiểm tra lại đường dẫn hoặc tải file mới' : 'hoặc bấm để chọn file'}</span>
            </div>
          )}
        {busy ? <div class="v2up-bar" aria-hidden="true"><i style={{ width: progress + '%' }}></i></div> : null}
      </div>
      <input id={inputId} ref={fileRef} class="v2up-file" type="file" tabIndex={-1} aria-hidden="true" accept="image/jpeg,image/png,image/webp"
        onChange={(e) => handleFile(e.target.files && e.target.files[0])} />
      <div class="v2up-row">
        <input class="inp" aria-label="URL ảnh bìa" value={value} placeholder="Dán URL ảnh (https://… hoặc /api/img/…)"
          onInput={(e) => onChange && onChange(persistableCover(e.target.value) || e.target.value.replace(/^blob:.*/i, ''))} />
        <button class="btn ghost sm" type="button" onClick={openPicker}>{value ? 'Upload bìa mới' : 'Upload bìa'}</button>
        {value ? <button class="btn ghost sm" type="button" onClick={() => onChange && onChange('')}>Gỡ bìa</button> : null}
      </div>
      {onAltChange
        ? <input class="inp" aria-label="Alt text ảnh bìa" value={altValue} placeholder="Mô tả ngắn cho trình đọc màn hình (tuỳ chọn)"
            onInput={(e) => onAltChange(e.target.value)} />
        : null}
      {error ? <p class="v2up-err" role="alert">{error} {onUpload ? <button class="btn ghost sm" type="button" onClick={openPicker}>Thử lại</button> : null}</p> : null}
      <p class="hint v2up-hint">{hint}</p>
    </div>
  );
}
