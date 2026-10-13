import { h } from 'preact';
import { PART_TYPES } from '../../shared/reading-groups.js';

export function ReadingGroupEditor({lib, current, parts, onChange}) {
  const rows = parts || [];
  const add = slug => {
    if (!slug) return;
    onChange((rows.length ? rows : [{slug: current.slug, type: 'main'}]).concat([{slug, type: 'extra'}]));
  };
  function move(index, delta) {
    const next = rows.slice();
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    onChange(next);
  }
  return <section class="v2fsec" aria-label="Các phần và thứ tự đọc">
    <div class="v2fsec-head"><b>Các phần &amp; thứ tự đọc</b></div>
    <p class="hint">Chọn các truyện đã có. Lưu metadata sẽ cập nhật nhóm cho tất cả phần bên dưới; không thay đổi chương hay gửi thông báo.</p>
    <label class="fl">Thêm phần vào nhóm<select class="inp" value="" onChange={e => {add(e.target.value); e.target.value = '';}}>
      <option value="">Chọn truyện…</option>
      {lib.filter(n => n.slug !== current.slug && !rows.some(p => p.slug === n.slug)).map(n =>
        <option value={n.slug} disabled={!!n.readingGroup && n.readingGroup !== current.readingGroup}>{n.title}{n.readingGroup && n.readingGroup !== current.readingGroup ? ' (thuộc nhóm khác)' : ''}</option>)}
    </select></label>
    <ol class="reading-group-editor">
      {rows.map((part, i) => <li key={part.slug}>
        <span>{i + 1}. {(lib.find(n => n.slug === part.slug) || {}).title || part.slug}{part.slug === current.slug ? ' (đang sửa)' : ''}</span>
        <select class="inp" aria-label={'Loại phần ' + (i + 1)} value={part.type} onChange={e => onChange(rows.map((p,j) => j === i ? {...p, type: e.target.value} : p))}>
          {Object.entries(PART_TYPES).map(([value,label]) => <option value={value}>{label}</option>)}
        </select>
        <button class="btn ghost sm" type="button" disabled={!i} aria-label={'Đưa phần ' + (i+1) + ' lên'} onClick={() => move(i,-1)}>↑</button>
        <button class="btn ghost sm" type="button" disabled={i === rows.length-1} aria-label={'Đưa phần ' + (i+1) + ' xuống'} onClick={() => move(i,1)}>↓</button>
        <button class="btn ghost sm" type="button" disabled={part.slug === current.slug} aria-label={'Gỡ phần ' + (i+1)} onClick={() => {const next = rows.filter((_,j) => j !== i); onChange(next.length < 2 ? [] : next);}}>Gỡ</button>
      </li>)}
    </ol>
    {!!rows.length && <button class="btn ghost sm" type="button" onClick={() => onChange([])}>Gỡ liên kết cả nhóm (áp dụng khi lưu)</button>}
  </section>;
}
