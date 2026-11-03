import { h } from 'preact';
import { useMemo, useState } from 'preact/hooks';

/* ============================================================================
   Kinh doanh & phân loại (r127) — hai màn mà bản mockup có nhưng admin thật
   chưa có. Nguyên tắc: chỉ làm thứ GHI ĐƯỢC THẬT.
     · Thể loại & thẻ  → đọc thẳng registry.lib, sửa trạng thái / 18+ / cặp đôi
       / thẻ nội dung của từng bộ rồi ghi registry lên KV.
     · Doanh thu & ủng hộ → cấu hình hộp ủng hộ (registry.settings.donation, đây
       là field mà trang đọc THẬT SỰ dùng) + bảng quy đổi và máy tính chia 70/30.
   Không bịa giao dịch: mọi con số đều tính từ dữ liệu đang có.
   ========================================================================== */

const TONES = ['', 'ok', 'warn', 'info', 'bad', 'violet'];

function num(value) { return Number(value || 0).toLocaleString('vi-VN'); }
function vnd(value) { return num(Math.round(Number(value) || 0)) + 'đ'; }
function bookStatus(book) { return String((book && book.status) || '').trim() || 'Chưa đặt'; }
function tagsOf(book) { return Array.isArray(book && book.tags) ? book.tags : []; }

/* ---------------- 1. Thể loại & thẻ ---------------- */
export function TaxonomyPanel({ registry, lib, onSave, onOpenList, writeBlocked = false, online = false }) {
  const books = lib || (registry && registry.lib) || [];
  const saved = (registry && registry.settings && registry.settings.tags) || [];
  const [tags, setTags] = useState(() => saved.map((t) => (typeof t === 'string' ? { id: t, label: t } : Object.assign({ id: t.id || t.label, label: t.label || t.id }))));
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [pickedSlug, setPickedSlug] = useState('');
  const [bookTags, setBookTags] = useState({});
  const [busy, setBusy] = useState(false);

  const facets = useMemo(() => {
    const byStatus = {}, byCouple = {};
    let adult = 0, noCover = 0;
    books.forEach((b) => {
      byStatus[bookStatus(b)] = (byStatus[bookStatus(b)] || 0) + 1;
      const couple = String(b.couple || '').trim();
      if (couple) byCouple[couple] = (byCouple[couple] || 0) + 1;
      if (b.is18) adult += 1;
      if (!String(b.thumb || b.slide || '').trim()) noCover += 1;
    });
    const sort = (obj) => Object.keys(obj).map((k) => [k, obj[k]]).sort((a, b) => b[1] - a[1]);
    return { status: sort(byStatus), couple: sort(byCouple), adult, noCover };
  }, [books]);

  const usage = useMemo(() => {
    const map = {};
    books.forEach((b) => tagsOf(b).forEach((t) => { map[t] = (map[t] || 0) + 1; }));
    /* thẻ vừa gắn trong phiên cũng phải hiện số */
    Object.keys(bookTags).forEach((slug) => (bookTags[slug] || []).forEach((t) => {
      const old = tagsOf(books.find((b) => b.slug === slug));
      if (old.indexOf(t) < 0) map[t] = (map[t] || 0) + 1;
    }));
    return map;
  }, [books, bookTags]);

  const hits = useMemo(() => {
    const nq = q.trim().toLowerCase();
    if (!nq) return [];
    return books.filter((b) => [b.title, b.author, b.slug].join(' ').toLowerCase().indexOf(nq) >= 0).slice(0, 6);
  }, [q, books]);

  const picked = books.find((b) => b.slug === pickedSlug) || null;
  const pickedTags = picked ? (bookTags[picked.slug] || tagsOf(picked)) : [];

  function addTag(e) {
    e.preventDefault();
    const label = draft.trim();
    if (!label) return;
    if (tags.some((t) => String(t.label).toLowerCase() === label.toLowerCase())) { setDraft(''); return; }
    setTags(tags.concat([{ id: label.toLowerCase().replace(/\s+/g, '-'), label }]));
    setDraft('');
  }

  function toggleBookTag(tagId) {
    if (!picked) return;
    const now = pickedTags.indexOf(tagId) >= 0 ? pickedTags.filter((t) => t !== tagId) : pickedTags.concat([tagId]);
    setBookTags(Object.assign({}, bookTags, { [picked.slug]: now }));
  }

  async function save() {
    setBusy(true);
    try {
      const changed = Object.keys(bookTags).map((slug) => ({ slug, tags: bookTags[slug] }));
      await onSave({ tags: tags.filter((t) => t.label), assign: changed });
    } finally { setBusy(false); }
  }

  return (
    <div id="pane-taxonomy" class="v2pane">
      <section class="card2">
        <div class="row"><h3>Phân loại đang dùng</h3><span class="grow"></span>
          <span class="pill">{num(books.length)} bộ</span></div>
        <p class="hint">Đếm trực tiếp từ registry.lib — đúng bằng dữ liệu trang đọc đang thấy.</p>
        <div class="v2tax-facets">
          {facets.status.map(([label, n]) => (
            <button class="v2tax-chip" type="button" key={label} onClick={() => onOpenList && onOpenList(label)}>
              <span class="d"></span><b>{label}</b><em>{num(n)}</em>
            </button>
          ))}
          <button class="v2tax-chip" type="button" onClick={() => onOpenList && onOpenList('')}>
            <span class="d"></span><b>18+</b><em>{num(facets.adult)}</em>
          </button>
          <button class="v2tax-chip" type="button" onClick={() => onOpenList && onOpenList('')}>
            <span class="d"></span><b>Thiếu ảnh bìa</b><em>{num(facets.noCover)}</em>
          </button>
        </div>
        <div class="v2tablewrap mt">
          <table class="tbl v2tax-couples">
            <thead><tr><th>Cặp đôi / nguồn</th><th class="v2num">Số bộ</th></tr></thead>
            <tbody>
              {facets.couple.slice(0, 8).map(([label, n]) => (
                <tr key={label}><td data-lb="Cặp đôi">{label}</td><td data-lb="Số bộ" class="v2num">{num(n)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section class="card2">
        <div class="row"><h3>Thẻ nội dung</h3><span class="grow"></span>
          <span class="sm muted">{tags.length} thẻ</span></div>
        <p class="hint">Thẻ lưu trong <code>registry.settings.tags</code> và gắn vào từng bộ ở <code>book.tags</code>. Dùng để lọc trong quản trị; trang đọc bỏ qua field lạ.</p>
        <form class="row v2tax-add" onSubmit={addTag}>
          <input class="inp" aria-label="Tên thẻ mới" placeholder="vd: ngọt, ngược, học đường…" value={draft} onInput={(e) => setDraft(e.target.value)} />
          <button class="btn" type="submit">Thêm thẻ</button>
        </form>
        <div class="v2tax-tags">
          {tags.length ? tags.map((t) => (
            <span class="v2tax-tag" key={t.id}>
              <b>{t.label}</b><em>{num(usage[t.id] || usage[t.label] || 0)}</em>
              <button type="button" aria-label={'Xoá thẻ ' + t.label} onClick={() => setTags(tags.filter((x) => x.id !== t.id))}>×</button>
            </span>
          )) : <span class="sm muted">Chưa có thẻ nào.</span>}
        </div>
      </section>

      <section class="card2">
        <div class="row"><h3>Gắn thẻ cho một bộ</h3><span class="grow"></span>
          {picked ? <span class="pill ok">{picked.title}</span> : null}</div>
        <div class="v2tax-pick">
          <input class="inp" aria-label="Tìm bộ để gắn thẻ" placeholder="Tìm theo tên truyện, tác giả…" value={q} onInput={(e) => setQ(e.target.value)} />
          {hits.length ? (
            <ul class="v2tax-hits">
              {hits.map((b) => (
                <li key={b.slug}>
                  <button type="button" onClick={() => { setPickedSlug(b.slug); setQ(''); }}>
                    <b>{b.title}</b><span class="sm muted">{b.author || b.slug}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {picked ? (
          <div class="v2tax-assign">
            {tags.length ? tags.map((t) => (
              <label class="v2tax-check" key={t.id}>
                <input type="checkbox" checked={pickedTags.indexOf(t.id) >= 0} onChange={() => toggleBookTag(t.id)} />
                <span>{t.label}</span>
              </label>
            )) : <span class="sm muted">Thêm thẻ ở khối trên trước.</span>}
          </div>
        ) : <p class="hint">Chọn một bộ để gắn thẻ.</p>}
        <div class="row mt">
          <button class="btn pri" type="button" disabled={busy || writeBlocked} onClick={save}>{busy ? 'Đang lưu…' : 'Lưu phân loại'}</button>
          <span class="sm muted">{online ? 'Ghi registry lên Cloudflare KV.' : 'Chưa nối ADMIN_KEY — chỉ lưu trong phiên này.'}</span>
        </div>
      </section>
    </div>
  );
}

/* ---------------- 2. Doanh thu & ủng hộ ---------------- */
const PACKAGES = [
  { label: 'Gói 20.000đ', amount: 20000, bonus: 0 },
  { label: 'Gói 50.000đ', amount: 50000, bonus: 5 },
  { label: 'Gói 100.000đ', amount: 100000, bonus: 10 },
  { label: 'Gói 200.000đ', amount: 200000, bonus: 15 },
  { label: 'Gói 500.000đ', amount: 500000, bonus: 20 },
  { label: 'Gói 1.000.000đ', amount: 1000000, bonus: 25 },
];

export function RevenuePanel({ registry, onSave, writeBlocked = false, online = false }) {
  const cfg = Object.assign({ enabled: false, bank: '', accountNo: '', accountName: '', momo: '', qr: '', message: '' },
    (registry && registry.settings && registry.settings.donation) || {});
  const [form, setForm] = useState(cfg);
  const [busy, setBusy] = useState(false);
  const [vipPrice, setVipPrice] = useState(5);
  const [unlocks, setUnlocks] = useState(120);

  const set = (k) => (e) => setForm(Object.assign({}, form, { [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function save() {
    setBusy(true);
    try { await onSave(form); } finally { setBusy(false); }
  }

  /* 1 xu = 100đ; giá mở khoá chương VIP tính bằng xu; tác giả 70% — nền tảng 30% */
  const VND_PER_XU = 100;
  const gross = Number(vipPrice) * VND_PER_XU * (Number(unlocks) || 0);
  const authorCut = Math.round(gross * 0.7);
  const platformCut = gross - authorCut;

  return (
    <div id="pane-revenue" class="v2pane">
      <section class="card2">
        <div class="row"><h3>Hộp ủng hộ trên web</h3><span class="grow"></span>
          <span class={'pill ' + (form.enabled ? 'ok' : '')}>{form.enabled ? 'Đang bật' : 'Đang tắt'}</span></div>
        <p class="hint">Đây là <code>registry.settings.donation</code> — field mà trang đọc dùng thật. Bật công tắc rồi lưu là hộp ủng hộ hiện ở chân trang.</p>
        <div class="v2rev-form">
          <label class="v2rev-field">
            <span class="fl">Hiện hộp ủng hộ</span>
            <span class="v2rev-switch">
              <input type="checkbox" checked={!!form.enabled} onChange={set('enabled')} aria-label="Bật hộp ủng hộ" />
              <span>{form.enabled ? 'Bật' : 'Tắt'}</span>
            </span>
          </label>
          <label class="v2rev-field"><span class="fl">Ngân hàng</span>
            <input class="inp" value={form.bank || ''} onInput={set('bank')} placeholder="Vietcombank…" /></label>
          <label class="v2rev-field"><span class="fl">Số tài khoản</span>
            <input class="inp" value={form.accountNo || ''} onInput={set('accountNo')} placeholder="0123456789" inputMode="numeric" /></label>
          <label class="v2rev-field"><span class="fl">Chủ tài khoản</span>
            <input class="inp" value={form.accountName || ''} onInput={set('accountName')} placeholder="NGUYEN VAN A" /></label>
          <label class="v2rev-field"><span class="fl">MoMo</span>
            <input class="inp" value={form.momo || ''} onInput={set('momo')} placeholder="Số ví MoMo" inputMode="numeric" /></label>
          <label class="v2rev-field"><span class="fl">Link ảnh QR</span>
            <input class="inp" value={form.qr || ''} onInput={set('qr')} placeholder="https://…" /></label>
          <label class="v2rev-field v2rev-wide"><span class="fl">Lời nhắn</span>
            <input class="inp" value={form.message || ''} onInput={set('message')} placeholder="Cảm ơn bạn đã ủng hộ ssochuz!" /></label>
        </div>
        <div class="row mt">
          <button class="btn pri" type="button" disabled={busy || writeBlocked} onClick={save}>{busy ? 'Đang lưu…' : 'Lưu cấu hình'}</button>
          <span class="sm muted">{online ? 'Ghi registry.settings.donation lên KV.' : 'Chưa nối ADMIN_KEY — chỉ lưu trong phiên này.'}</span>
        </div>
      </section>

      <section class="card2">
        <h3>Máy tính chia doanh thu</h3>
        <p class="hint">1 xu = 100đ · tác giả 70% / nền tảng 30%. Số liệu tính tại chỗ, không ghi gì lên KV.</p>
        <div class="v2rev-calc">
          <label class="v2rev-field"><span class="fl">Giá mở khoá 1 chương VIP (xu)</span>
            <input class="inp" type="number" min="3" max="10" step="1" value={vipPrice} onInput={(e) => setVipPrice(Math.max(0, Math.min(10, Number(e.target.value) || 0)))} /></label>
          <label class="v2rev-field"><span class="fl">Số lượt mở khoá</span>
            <input class="inp" type="number" min="0" step="1" value={unlocks} onInput={(e) => setUnlocks(Math.max(0, Number(e.target.value) || 0))} /></label>
        </div>
        <p class="hint sm">Chương VIP chỉ cho chọn 3–10 xu; ngoài khoảng đó ô nhập tự kẹp lại.</p>
        <div class="v2rev-out">
          <div><span>Tổng thu</span><b>{vnd(gross)}</b></div>
          <div><span>Tác giả (70%)</span><b class="ok">{vnd(authorCut)}</b></div>
          <div><span>Nền tảng (30%)</span><b>{vnd(platformCut)}</b></div>
        </div>
      </section>

      <section class="card2">
        <div class="row"><h3>Khung gói quy đổi</h3><span class="grow"></span><span class="pill">tham chiếu</span></div>
        <p class="hint">Sáu mốc nạp đang dùng trong bản mockup. Nạp thật cần cổng thanh toán ở Worker — hiện chưa bật, nên bảng này chỉ để đối chiếu.</p>
        <div class="v2tablewrap">
          <table class="tbl">
            <thead><tr><th>Gói</th><th class="v2num">Số tiền</th><th class="v2num">Thưởng</th><th class="v2num">Xu nhận</th></tr></thead>
            <tbody>
              {PACKAGES.map((p) => (
                <tr key={p.amount}>
                  <td data-lb="Gói">{p.label}</td>
                  <td data-lb="Số tiền" class="v2num">{vnd(p.amount)}</td>
                  <td data-lb="Thưởng" class="v2num">{p.bonus ? '+' + p.bonus + '%' : '—'}</td>
                  <td data-lb="Xu nhận" class="v2num">{num(Math.round(p.amount / VND_PER_XU * (1 + p.bonus / 100)))} xu</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
