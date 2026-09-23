import { h } from 'preact';
import { useState } from 'preact/hooks';
import { BookCover } from './BookCover.jsx';
import { slideSlug } from '../utils/books.js';
import { LockedBadge, GenreBadge } from './Badges.jsx';

function bySlug(registry) {
  const map = {};
  ((registry && registry.lib) || []).forEach((b) => { if (b && b.slug) map[b.slug] = b; });
  return map;
}

export function HomepageCMS({ registry, apiBase, onSave, writeBlocked = false, online = false }) {
  const lib = (registry && registry.lib) || [];
  const books = bySlug(registry);
  const [slides, setSlides] = useState(() => (registry.slides || []).map((x) => {
    if (typeof x === 'string') return { slug: x, reason: '' };
    return { slug: x.slug || '', reason: x.reason || '' };
  }));
  const [choice, setChoice] = useState(() => {
    const raw = registry.editorChoice || (registry.settings && registry.settings.editorChoice) || [];
    return raw.map((x) => typeof x === 'string' ? x : (x && x.slug)).filter(Boolean);
  });
  const [sched, setSched] = useState(() => JSON.parse(JSON.stringify((registry.schedule && registry.schedule.items) || [])));
  const [note, setNote] = useState((registry.schedule && registry.schedule.note) || 'Lịch có thể thay đổi nếu có việc đột xuất.');
  const [announce, setAnnounce] = useState(() => Object.assign({ enabled: false, text: '', href: '' }, (registry.settings && registry.settings.announcement) || {}));
  const [addSlide, setAddSlide] = useState('');
  const [addChoice, setAddChoice] = useState('');
  const [preview, setPreview] = useState('desktop');

  function move(list, i, dir) {
    const j = i + dir;
    if (j < 0 || j >= list.length) return list;
    const next = list.slice();
    const t = next[i]; next[i] = next[j]; next[j] = t;
    return next;
  }

  async function save(e) {
    e.preventDefault();
    await onSave({
      slides: slides.filter((s) => s.slug).slice(0, 8),
      editorChoice: choice.filter(Boolean).slice(0, 12),
      schedule: { items: sched.filter((it) => it && (it.slug || it.title)), note },
      announcement: announce,
    });
  }

  return (
    <div id="pane-homepage" class="v2pane">
      <form onSubmit={save}>
        <section class="card2">
          <div class="row"><h3>Hero / slides trang chủ</h3><span class="grow"></span>
            <span class="seg"><button type="button" class={preview === 'desktop' ? 'on' : ''} onClick={() => setPreview('desktop')}>Desktop</button>
              <button type="button" class={preview === 'mobile' ? 'on' : ''} onClick={() => setPreview('mobile')}>Mobile</button></span>
          </div>
          <p class="hint">Tối đa 8 slide. Ảnh bìa lấy từ trường thumb đã lưu (URL Worker), không dùng blob.</p>
          <div class={'v2home-preview ' + preview}>
            {slides.map((s) => {
              const b = books[s.slug];
              return <div class="v2hp-card" key={s.slug}><BookCover book={b} apiBase={apiBase} /><b>{b ? b.title : s.slug}</b><LockedBadge book={b} /><GenreBadge book={b} registry={registry} /></div>;
            })}
            {!slides.length ? <div class="empty sm">Chưa chọn slide — trang chủ sẽ lấy 5 bộ mới nhất.</div> : null}
          </div>
          <ul class="v2sort">
            {slides.map((s, i) => {
              const b = books[s.slug];
              return (
                <li key={s.slug}>
                  <BookCover book={b} apiBase={apiBase} width={40} height={60} />
                  <span class="grow"><b>{b ? b.title : s.slug}</b>
                    <LockedBadge book={b} />
                    {b && b.lock ? <p class="v2lock-warn">Truyện này đang khóa. Người đọc có thể thấy thẻ truyện nhưng không thể đọc chương nếu không có token hợp lệ.</p> : null}
                    <input class="inp" value={s.reason} placeholder="Lý do đề xuất (tuỳ chọn)"
                      onInput={(e) => setSlides(slides.map((x, k) => k === i ? Object.assign({}, x, { reason: e.target.value }) : x))} />
                  </span>
                  <button class="btn ghost sm" type="button" onClick={() => setSlides(move(slides, i, -1))}>↑</button>
                  <button class="btn ghost sm" type="button" onClick={() => setSlides(move(slides, i, 1))}>↓</button>
                  <button class="btn ghost sm" type="button" onClick={() => setSlides(slides.filter((_, k) => k !== i))}>Gỡ</button>
                </li>
              );
            })}
          </ul>
          <div class="row">
            <select class="inp" value={addSlide} onChange={(e) => setAddSlide(e.target.value)}>
              <option value="">Thêm bộ vào hero…</option>
              {lib.filter((b) => !slides.some((s) => s.slug === b.slug)).map((b) => <option key={b.slug} value={b.slug}>{b.title}</option>)}
            </select>
            <button class="btn" type="button" onClick={() => { if (addSlide) { setSlides(slides.concat([{ slug: addSlide, reason: '' }])); setAddSlide(''); } }}>Thêm slide</button>
          </div>
        </section>

        <section class="card2">
          <h3>Editor’s choice</h3>
          <ul class="v2sort">
            {choice.map((slug, i) => {
              const b = books[slug];
              return (
                <li key={slug}>
                  <BookCover book={b} apiBase={apiBase} width={40} height={60} />
                  <span class="grow"><b>{b ? b.title : slug}</b></span>
                  <button class="btn ghost sm" type="button" onClick={() => setChoice(move(choice, i, -1))}>↑</button>
                  <button class="btn ghost sm" type="button" onClick={() => setChoice(move(choice, i, 1))}>↓</button>
                  <button class="btn ghost sm" type="button" onClick={() => setChoice(choice.filter((_, k) => k !== i))}>Gỡ</button>
                </li>
              );
            })}
          </ul>
          <div class="row">
            <select class="inp" value={addChoice} onChange={(e) => setAddChoice(e.target.value)}>
              <option value="">Thêm bộ vào lựa chọn biên tập…</option>
              {lib.filter((b) => choice.indexOf(b.slug) < 0).map((b) => <option key={b.slug} value={b.slug}>{b.title}</option>)}
            </select>
            <button class="btn" type="button" onClick={() => { if (addChoice) { setChoice(choice.concat([addChoice])); setAddChoice(''); } }}>Thêm</button>
          </div>
        </section>

        <section class="card2">
          <h3>Lịch ra chương</h3>
          {sched.map((it, i) => (
            <div class="v2form row" key={i}>
              <input class="inp" value={it.days || ''} placeholder="Thứ 2, Thứ 5" onInput={(e) => setSched(sched.map((x, k) => k === i ? Object.assign({}, x, { days: e.target.value }) : x))} />
              <select class="inp" value={it.slug || ''} onChange={(e) => setSched(sched.map((x, k) => k === i ? Object.assign({}, x, { slug: e.target.value, title: (books[e.target.value] && books[e.target.value].title) || x.title }) : x))}>
                <option value="">Chọn bộ…</option>
                {lib.map((b) => <option key={b.slug} value={b.slug}>{b.title}</option>)}
              </select>
              <input class="inp" value={it.detail || ''} placeholder="Ghi chú" onInput={(e) => setSched(sched.map((x, k) => k === i ? Object.assign({}, x, { detail: e.target.value }) : x))} />
              <button class="btn ghost sm" type="button" onClick={() => setSched(sched.filter((_, k) => k !== i))}>Xoá</button>
            </div>
          ))}
          <button class="btn ghost sm" type="button" onClick={() => setSched(sched.concat([{ days: '', slug: '', title: '', detail: '' }]))}>Thêm dòng lịch</button>
          <label class="fl">Ghi chú lịch
            <input class="inp" value={note} onInput={(e) => setNote(e.target.value)} />
          </label>
        </section>

        <section class="card2">
          <h3>Thông báo trang chủ</h3>
          <label class="chk"><input type="checkbox" checked={!!announce.enabled} onChange={(e) => setAnnounce(Object.assign({}, announce, { enabled: e.target.checked }))} /> Bật banner</label>
          <input class="inp" value={announce.text} placeholder="Nội dung thông báo" onInput={(e) => setAnnounce(Object.assign({}, announce, { text: e.target.value }))} />
          <input class="inp" value={announce.href} placeholder="Link (tuỳ chọn)" onInput={(e) => setAnnounce(Object.assign({}, announce, { href: e.target.value }))} />
        </section>

        <div class="row sticky-actions">
          <button class="btn pri" type="submit" disabled={writeBlocked || !online}>{writeBlocked ? 'Hết quota KV' : (!online ? 'Chế độ tĩnh — không ghi KV' : 'Lưu trang chủ')}</button>
        </div>
      </form>
    </div>
  );
}
