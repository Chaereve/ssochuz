/* ============================================================================
   NÉN ẢNH TRƯỚC KHI UPLOAD — chốt chặn dung lượng kho ảnh
   ----------------------------------------------------------------------------
   Vì sao quan trọng: bảng ssochuz_blobs nằm trong Postgres của Supabase, gói
   free chỉ 500 MB *database* (Storage 1 GB tính riêng). Ảnh thô từ điện thoại
   (3–8 MB/tấm) chỉ vài chục tấm là hết chỗ, nên trình duyệt PHẢI nén trước khi
   gửi: thu nhỏ cạnh dài, hạ chất lượng dần cho tới khi lọt “hạn mức” của từng
   loại ảnh (bìa nhẹ hơn ảnh trong chương vì bìa chỉ hiển thị ~400px).
   Ba việc làm ở đây:
     1) resize + WebP (rơi về JPEG nếu trình duyệt không mã hoá được WebP)
     2) hạ chất lượng theo bậc cho tới khi ≤ maxBytes (mặc định bìa 120 KB,
        ảnh chương 260 KB)
     3) băm nội dung thành ID ổn định → upload lại đúng ảnh cũ thì Worker trả
        URL cũ, KHÔNG ghi thêm bản sao (xem contentId)
   ============================================================================ */

export function dataUrlToBase64(dataUrl) {
  return String(dataUrl || '').replace(/^data:[^;,]+;base64,/, '').replace(/\s/g, '');
}

export function bytesOfBase64(base64) {
  return Math.floor(String(base64 || '').replace(/=+$/, '').length * 3 / 4);
}

export function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không đọc được ảnh.'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

/* Hạn mức từng loại ảnh — chọn theo kích thước hiển thị thật:
   bìa card ~400×600px, ảnh chương đọc trên điện thoại ~1000px. */
export const IMAGE_BUDGET = {
  cover: { max: 1000, maxBytes: 120 * 1024, quality: 0.82 },
  chapter: { max: 1440, maxBytes: 260 * 1024, quality: 0.82 },
};
const QUALITY_LADDER = [0.82, 0.74, 0.66, 0.58, 0.5];
const SCALE_LADDER = [1, 0.85, 0.72, 0.6];

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Ảnh không hợp lệ hoặc trình duyệt không đọc được.'));
    image.src = dataUrl;
  });
}

/* Băm nội dung ảnh → ID dạng 'h<32 hex>' (dài 33 ký tự, khớp route /api/img
   vốn nhận id 12–64 ký tự). Cùng tấm ảnh dán lại lần nữa ra cùng ID ⇒ Worker
   trả URL cũ, không tốn thêm chỗ trong Postgres/Storage.
   crypto.subtle chỉ có ở https/ổ đĩa; thiếu thì rơi về hàm băm đơn giản
   (vẫn ổn định trong cùng một máy, đủ để chống upload trùng). */
export async function contentId(base64) {
  const s = String(base64 || '');
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder === 'function') {
      /* băm chuỗi base64 (không cần giải mã nhị phân — chỉ cần ổn định) */
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
      const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
      return 'h' + hex.slice(0, 32);
    }
  } catch (e) { /* rơi xuống hàm băm dưới */ }
  let h1 = 0x811c9dc5, h2 = 0x1000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = (h1 ^ c) >>> 0; h1 = (h1 * 16777619) >>> 0;
    h2 = (h2 + c * (i + 7)) >>> 0; h2 = (h2 ^ (h2 << 5)) >>> 0;
  }
  const hex = h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
  return 'h' + (hex + hex).slice(0, 32);
}

/* kind: 'cover' (bìa) | 'chapter' (ảnh trong chương)
   Trả { data, type, width, height, bytes, dataUrl, originalBytes, savedBytes, passes } */
export async function compressImage(file, options = {}) {
  if (!file || !/^image\/(jpeg|png|webp)$/i.test(file.type || '')) throw new Error('Chỉ nhận ảnh JPG, PNG hoặc WebP.');
  if (file.size > 12 * 1024 * 1024) throw new Error('Ảnh quá lớn (trên 12 MB) — hãy giảm kích thước trước.');
  const preset = IMAGE_BUDGET[options.kind] || IMAGE_BUDGET.chapter;
  const max = Math.max(240, parseInt(options.max, 10) || preset.max);
  const maxBytes = Math.max(24 * 1024, parseInt(options.maxBytes, 10) || preset.maxBytes);
  const baseQuality = Math.min(0.95, Math.max(0.4, Number(options.quality) || preset.quality));

  const input = await readAsDataURL(file);
  const img = await loadImage(input);
  const naturalW = img.naturalWidth || img.width || 1;
  const naturalH = img.naturalHeight || img.height || 1;
  const firstScale = Math.min(1, max / Math.max(naturalW, naturalH));
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Trình duyệt không hỗ trợ nén ảnh bằng canvas.');

  const draw = (scale) => {
    const width = Math.max(1, Math.round(naturalW * firstScale * scale));
    const height = Math.max(1, Math.round(naturalH * firstScale * scale));
    canvas.width = width; canvas.height = height;
    /* nền trắng: ảnh PNG trong suốt khi chuyển sang JPEG sẽ không bị nền đen */
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return { width, height };
  };

  let type = 'image/webp';
  const encode = (quality) => {
    let dataUrl = canvas.toDataURL(type, quality);
    if (!/^data:image\/webp/i.test(dataUrl)) {
      /* trình duyệt không có WebP (Safari cũ) → JPEG, nền trắng đã tô sẵn */
      type = 'image/jpeg';
      dataUrl = canvas.toDataURL(type, quality);
    }
    return { type, dataUrl, data: dataUrlToBase64(dataUrl) };
  };

  let best = null;
  for (const scale of SCALE_LADDER) {
    const size = draw(scale);
    for (const q of QUALITY_LADDER) {
      const out = encode(Math.min(q, baseQuality));
      const bytes = bytesOfBase64(out.data);
      const cand = { data: out.data, type: out.type, dataUrl: out.dataUrl, bytes, width: size.width, height: size.height };
      if (!best || bytes < best.bytes) best = cand;
      if (bytes <= maxBytes) return finish(cand, file, naturalW, naturalH, true);
    }
  }
  /* hạ hết bậc vẫn quá hạn mức → lấy bản nhỏ nhất (không chặn người dùng) */
  return finish(best, file, naturalW, naturalH, false);
}

function finish(best, file, naturalW, naturalH, passes) {
  return {
    data: best.data, type: best.type, dataUrl: best.dataUrl,
    width: best.width, height: best.height, bytes: best.bytes,
    originalBytes: file.size || 0,
    originalWidth: naturalW, originalHeight: naturalH,
    savedBytes: Math.max(0, (file.size || 0) - best.bytes),
    passes,
  };
}

/* Gắn ID nội dung vào kết quả nén (băm là bất đồng bộ nên tách riêng) */
export async function withContentId(packed) {
  if (!packed) return packed;
  if (!packed.id) packed.id = await contentId(packed.data);
  return packed;
}

export function formatBytes(bytes) {
  const n = Math.max(0, Number(bytes) || 0);
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (n / 1024 / 1024).toFixed(1).replace('.0', '') + ' MB';
}
