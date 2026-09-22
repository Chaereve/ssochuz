import { h } from 'preact';
import { parseTags } from '../utils/books.js';

/* Ô nhập tags kiểu FICTBASE — hoàn toàn controlled: ô input giữ chuỗi thẻ cách
   nhau bằng dấu phẩy; bấm chip gợi ý = nối thêm; bấm chip đã có = bỏ. Không giữ
   state nội bộ nên không bao giờ mất chữ khi bấm nhanh gợi ý. */
export function TagsField({ value = '', suggestions = [], onChange }) {
  const tags = parseTags(value);
  const add = (raw) => {
    const next = parseTags(value + ',' + raw);
    onChange(next.join(', '));
  };
  const remove = (tag) => {
    onChange(parseTags(tags.filter((t) => t.toLowerCase() !== String(tag).toLowerCase()).join(',')).join(', '));
  };
  const unused = suggestions.filter((t) => !tags.some((x) => x.toLowerCase() === String(t).toLowerCase())).slice(0, 10);
  return (
    <div class="v2tags">
      <input class="inp" value={value} placeholder="vd: ngôn tình, học đường, he…" onInput={(e) => onChange(e.currentTarget.value)} />
      {tags.length ? <div class="v2tags-row">{tags.map((t) => <button type="button" key={t} class="v2tag on" title="Bấm để bỏ thẻ này" onClick={() => remove(t)}>{t} ×</button>)}</div> : null}
      {unused.length ? <div class="v2tags-row"><span class="sm muted">gợi ý:</span>{unused.map((t) => <button type="button" key={t} class="v2tag" title="Bấm để thêm thẻ này" onClick={() => add(t)}>+ {t}</button>)}</div> : null}
      <p class="hint">Thẻ gắn cho bộ truyện (hiện ở trang truyện, giúp độc giả tìm theo chất truyện). Cách nhau bằng dấu phẩy, tối đa 12 thẻ.</p>
    </div>
  );
}
