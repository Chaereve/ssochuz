/* ============================================================================
   src/admin/editor/autosave.js · TỰ LƯU CHƯƠNG ĐANG VIẾT VÀO MÁY (IndexedDB)
   ----------------------------------------------------------------------------
   VẤN ĐỀ: đang viết dở mà đóng nhầm tab, mất mạng, hay trình duyệt sập thì bài
   viết bay sạch — vì nội dung chỉ nằm trong bộ nhớ cho tới khi bấm "Lưu".

   VÌ SAO IndexedDB CHỨ KHÔNG PHẢI localStorage (đã có sẵn cơ chế nháp):
     · Nháp cũ (LS.draft) lưu TOÀN BỘ thư viện vào localStorage. Dữ liệu thật
       hiện là 26 MB / 62 bộ, riêng bộ lớn nhất 1,8 MB, trong khi localStorage
       chỉ ~5 MB cho cả tên miền → ném QuotaExceededError, đúng nhánh báo
       "Nháp quá lớn để lưu trong máy" trong legacy.js.
     · localStorage ghi ĐỒNG BỘ, chặn luồng giao diện. Ghi vài trăm kB mỗi 2
       giây sẽ làm khựng lúc gõ.
   IndexedDB ghi bất đồng bộ, hạn mức lớn hơn nhiều, và cho lưu TỪNG CHƯƠNG
   riêng nên mỗi lần ghi chỉ vài kB.

   QUAN HỆ VỚI NHÁP CŨ: không đụng tới. Nháp cũ là ảnh chụp cả thư viện do
   người dùng tự bấm; cái này là lưới an toàn tự động cho riêng chương đang mở.

   KHÔNG LƯU KHOÁ: chỉ có slug, số chương, tiêu đề, HTML và mốc thời gian.
   Tuyệt đối không ADMIN_KEY (yêu cầu bảo mật của dự án).
   ========================================================================== */

const TEN_DB = 'ssochuz-admin';
const KHO = 'nhap-chuong';
const PHIEN_BAN = 1;
/* Nháp cũ hơn 7 ngày thì dọn: tránh phình bộ nhớ máy người dùng. */
const HAN_NGAY = 7;

let dbP = null;

function moDB() {
  if (dbP) return dbP;
  dbP = new Promise((thanh, hong) => {
    try {
      if (typeof indexedDB === 'undefined') { hong(new Error('trình duyệt không có IndexedDB')); return; }
      const rq = indexedDB.open(TEN_DB, PHIEN_BAN);
      rq.onupgradeneeded = () => {
        const db = rq.result;
        if (!db.objectStoreNames.contains(KHO)) db.createObjectStore(KHO, { keyPath: 'ma' });
      };
      rq.onsuccess = () => thanh(rq.result);
      rq.onerror = () => hong(rq.error || new Error('không mở được IndexedDB'));
    } catch (e) { hong(e); }
  });
  /* Hỏng thì cho thử lại ở lần sau chứ không ghi nhớ lời hứa đã vỡ. */
  dbP.catch(() => { dbP = null; });
  return dbP;
}

function ma(slug, idx) { return String(slug || '') + '#' + String(idx); }

function giaoDich(quyen, viec) {
  return moDB().then((db) => new Promise((thanh, hong) => {
    const gd = db.transaction(KHO, quyen);
    const kho = gd.objectStore(KHO);
    let kq;
    try { kq = viec(kho); } catch (e) { hong(e); return; }
    /* Bóc kết quả khỏi IDBRequest. PHẢI nhận diện bằng 'result' in kq chứ
       không phải kq.result !== undefined: khi get() không tìm thấy bản ghi thì
       result ĐÚNG LÀ undefined, và nếu xét theo giá trị ta sẽ trả về nguyên cái
       IDBRequest — một vật thể luôn "thật", khiến bên gọi tưởng là có nháp.
       Lỗi này đã làm doc() trả về IDBRequest thay vì null. */
    gd.oncomplete = () => thanh(kq && typeof kq === 'object' && 'result' in kq ? kq.result : kq);
    gd.onerror = () => hong(gd.error || new Error('lỗi IndexedDB'));
    gd.onabort = () => hong(gd.error || new Error('giao dịch bị huỷ'));
  }));
}

/* Ghi nháp cho MỘT chương. */
function luu(slug, idx, title, html) {
  if (!slug || idx == null || idx < 0) return Promise.resolve(false);
  return giaoDich('readwrite', (kho) => kho.put({
    ma: ma(slug, idx), slug: String(slug), idx: Number(idx),
    title: String(title || ''), html: String(html || ''), at: Date.now(),
  })).then(() => true).catch(() => false);
}

function doc(slug, idx) {
  if (!slug || idx == null || idx < 0) return Promise.resolve(null);
  return giaoDich('readonly', (kho) => kho.get(ma(slug, idx)))
    .then((r) => r || null).catch(() => null);
}

function xoa(slug, idx) {
  if (!slug || idx == null || idx < 0) return Promise.resolve(false);
  return giaoDich('readwrite', (kho) => kho.delete(ma(slug, idx)))
    .then(() => true).catch(() => false);
}

function tatCa() {
  return giaoDich('readonly', (kho) => kho.getAll()).then((r) => r || []).catch(() => []);
}

/* Dọn nháp quá hạn. Gọi lúc trang khởi động, không chặn gì cả. */
function don(hanNgay) {
  const moc = Date.now() - (hanNgay || HAN_NGAY) * 86400000;
  return tatCa().then((ds) => {
    const cu = ds.filter((d) => !d.at || d.at < moc);
    if (!cu.length) return 0;
    return giaoDich('readwrite', (kho) => { cu.forEach((d) => kho.delete(d.ma)); })
      .then(() => cu.length).catch(() => 0);
  });
}

/* ------------------------- bộ hẹn giờ 2 giây ----------------------------- */
/* Gộp nhiều lần gõ thành một lần ghi. Mỗi lần gõ lại dời hẹn giờ; ngoài ra ép
   ghi mỗi 10 giây để viết liên tục không bao giờ bị trì hoãn vô hạn. */
function taoBoLuu(opts) {
  const o = opts || {};
  const tre = o.tre || 2000;
  const epSau = o.epSau || 10000;
  let hen = null;
  let lanDau = 0;      /* mốc lần gõ đầu tiên chưa được ghi */
  let cho = null;      /* dữ liệu đang chờ ghi */
  let dangGhi = false;

  function ghiNgay() {
    if (hen) { clearTimeout(hen); hen = null; }
    lanDau = 0;
    const d = cho;
    cho = null;
    if (!d) return Promise.resolve(false);
    dangGhi = true;
    return luu(d.slug, d.idx, d.title, d.html).then((ok) => {
      dangGhi = false;
      if (ok && typeof o.onLuu === 'function') o.onLuu(d);
      return ok;
    });
  }

  function dat(slug, idx, title, html) {
    cho = { slug: slug, idx: idx, title: title, html: html };
    const gio = Date.now();
    if (!lanDau) lanDau = gio;
    if (hen) clearTimeout(hen);
    /* đã chờ quá lâu thì ghi luôn, không dời nữa */
    if (gio - lanDau >= epSau) { ghiNgay(); return; }
    hen = setTimeout(ghiNgay, tre);
  }

  function huy() {
    if (hen) { clearTimeout(hen); hen = null; }
    cho = null; lanDau = 0;
  }

  return { dat: dat, ghiNgay: ghiNgay, huy: huy, dangCho: () => !!cho || dangGhi };
}

export { luu, doc, xoa, tatCa, don, taoBoLuu, ma, TEN_DB, KHO };
