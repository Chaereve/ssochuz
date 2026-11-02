import { h } from 'preact';
import { useState } from 'preact/hooks';
import { BookCover } from './BookCover.jsx';
import { LockedBadge, PublishStatusBadge } from './Badges.jsx';
import { chapterAtMs, hoursUntil } from '../../shared/schedule.js';

function fmtNext(iso) {
  const t = Date.parse(iso);
  if (!t) return '';
  try { return new Date(t).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch (e) { return ''; }
}

export function ChaptersHub({ registry, apiBase, onEdit }) {
  const lib = ((registry && registry.lib) || []).slice().sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
  const drafts = lib.filter((b) => String(b.pubStatus || 'published') === 'draft');
  const pending = lib.filter((b) => String(b.pubStatus || '') === 'pending_review');
  const scheduled = lib.filter((b) => String(b.pubStatus || '') === 'scheduled');
  /* bộ đang có CHƯƠNG chờ tới giờ — con số do Worker ghi vào registry sau mỗi
     lần lưu chương/cron, nên hub vẫn chỉ đọc metadata, không tải full HTML */
  const waiting = lib.filter((b) => Number(b.pending) > 0)
    .sort((a, b) => String(a.schedNext || 'z').localeCompare(String(b.schedNext || 'z')));
  const [pick, setPick] = useState('');
  const current = pick || (lib[0] && lib[0].slug) || '';
  function Row({ b, action }) {
    return (
      <li>
        <BookCover book={b} apiBase={apiBase} width={40} height={60} />
        <span class="grow">
          <b title={b.title}>{b.title}</b>
          <span class="sm muted">{b.updated || '—'} · {b.chapters || 0} chương</span>
          <span class="v2badges compact"><PublishStatusBadge book={b} /><LockedBadge book={b} /></span>
        </span>
        <button class="btn sm" type="button" onClick={() => onEdit(b.slug)}>{action || 'Sửa'}</button>
      </li>
    );
  }
  /* Bốn hàng đợi là BỐN CỘT VIỆC cùng hạng, không phải bốn tầng nội dung —
     trước đây mỗi hàng là một thẻ lớn xếp dọc, mắt phải nhảy qua cả thẻ trống
     mới tới hàng có việc. Nay chúng nằm cạnh nhau, số việc hiện ngay ở đầu
     thẻ, và thẻ rỗng vẫn giữ chỗ để bố cục không nhảy khi dữ liệu đổi. */
  const queues = [
    { key: 'draft', title: 'Nháp', hint: 'Chưa xuất bản.', rows: drafts, empty: 'Không có bộ nháp.' },
    { key: 'pending', title: 'Chờ duyệt', hint: 'Đã gửi duyệt.', rows: pending, empty: 'Không có bộ chờ duyệt.' },
    { key: 'scheduled', title: 'Hẹn giờ', hint: 'Cả bộ xuất bản theo lịch.', rows: scheduled, empty: 'Không có bộ hẹn giờ.' },
    { key: 'waiting', title: 'Chờ tới giờ', hint: 'Có chương hẹn giờ bên trong.', rows: waiting, empty: 'Không có chương nào đang hẹn giờ.' }
  ];
  return (
    <div id="pane-chapters" class="v2pane">
      <section class="card2">
        <div class="row"><h3>Chương &amp; xuất bản</h3><span class="grow"></span><span class="sm muted">{lib.length} bộ</span></div>
        <p class="hint">Chọn một bộ để quản lý chương, thứ tự và lịch đăng.</p>
        {lib.length ? (
          <div class="v2picker-row">
            <select class="inp" value={current} onChange={(e) => setPick(e.currentTarget.value)} aria-label="Chọn bộ">
              {lib.map((b) => <option key={b.slug} value={b.slug}>{b.title}</option>)}
            </select>
            <button class="btn pri" type="button" disabled={!current} onClick={() => onEdit(current)}>Quản lý chương</button>
          </div>
        ) : null}
      </section>
      <div class="v2queues">
        {queues.map((q) => (
          <section class="card2 v2queue" key={q.key} aria-label={q.title}>
            <div class="row v2queue-head">
              <h3>{q.title}</h3>
              <span class={'v2count' + (q.rows.length ? ' has' : '')} title={q.hint}>{q.rows.length}</span>
              <span class="grow"></span>
            </div>
            {q.key === 'waiting'
              ? (q.rows.length ? (
                <ul class="v2sort">
                  {q.rows.map((b) => (
                    <li key={b.slug}>
                      <BookCover book={b} apiBase={apiBase} width={40} height={60} />
                      <span class="grow">
                        <b title={b.title}>{b.title}</b>
                        <span class="sm muted">{Number(b.pending) || 0} chương chờ{b.schedNext ? ' · gần nhất ' + fmtNext(b.schedNext) + (hoursUntil(chapterAtMs({ at: b.schedNext })) ? ' (còn ~' + hoursUntil(chapterAtMs({ at: b.schedNext })) + ' giờ)' : '') : ''}</span>
                      </span>
                      <button class="btn sm" type="button" onClick={() => onEdit(b.slug)}>Sửa chương</button>
                    </li>
                  ))}
                </ul>
              ) : <div class="empty sm">{q.empty}</div>)
              : (q.rows.length ? <ul class="v2sort">{q.rows.map((b) => <Row key={b.slug} b={b} action="Sửa" />)}</ul> : <div class="empty sm">{q.empty}</div>)}
          </section>
        ))}
      </div>
      <section class="card2">
        <div class="row"><h3>Mới cập nhật</h3><span class="grow"></span><span class="sm muted">16 bộ gần nhất</span></div>
        <ul class="v2sort">
          {lib.slice(0, 16).map((b) => <Row key={b.slug} b={b} action="Sửa chương" />)}
        </ul>
      </section>
    </div>
  );
}
