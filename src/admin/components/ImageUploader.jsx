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
  hint = 'JPG, PNG hoặc WebP · tối đa 12 MB · nén WebP rồi lưu lên Worker (URL bền, không dùng blob:).',
  inputId,
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const fileRef = useRef(null);
  const preview = persistableCover(value) ? resolveCover(value, apiBase) : '';

  useEffect(() => {
    setError('');
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
      const url = await onUpload(file);
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

  return (
    <div class="v2up">
      <label class="fl">{label}</label>
      <div
        class={'v2up-drop' + (drag ? ' on' : '') + (busy ? ' busy' : '')}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current && fileRef.current.click()}
      >
        {preview
          ? <img class="v2up-preview" src={preview} alt={altValue || 'Xem trước bìa'} />
          : <div class="v2up-empty"><b>Kéo thả ảnh vào đây</b><span>hoặc bấm để chọn file</span></div>}
        {busy ? <div class="v2up-bar" aria-hidden="true"><i style={{ width: progress + '%' }}></i></div> : null}
      </div>
      <input id={inputId} ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden={false}
        onChange={(e) => handleFile(e.target.files && e.target.files[0])} />
      <div class="v2up-row">
        <input class="inp" value={value} placeholder="URL bìa bền (/api/img/… hoặc https://…)"
          onInput={(e) => onChange && onChange(persistableCover(e.target.value) || e.target.value.replace(/^blob:.*/i, ''))} />
        <button class="btn ghost sm" type="button" onClick={() => fileRef.current && fileRef.current.click()}>Upload bìa</button>
        {value ? <button class="btn ghost sm" type="button" onClick={() => onChange && onChange('')}>Gỡ bìa</button> : null}
        {value ? <button class="btn ghost sm" type="button" onClick={() => fileRef.current && fileRef.current.click()}>Thay ảnh</button> : null}
      </div>
      {onAltChange
        ? <input class="inp" value={altValue} placeholder="Alt text bìa (mô tả ngắn cho trình đọc màn hình)"
            onInput={(e) => onAltChange(e.target.value)} />
        : null}
      {error ? <p class="v2up-err">{error} {onUpload ? <button class="btn ghost sm" type="button" onClick={() => fileRef.current && fileRef.current.click()}>Thử lại</button> : null}</p> : null}
      <p class="hint">{hint}</p>
    </div>
  );
}
