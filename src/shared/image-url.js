/* ============================================================================
   ssochuz · URL ẢNH — bản DÙNG CHUNG (Worker + bài kiểm thử + công cụ sao lưu)
   ----------------------------------------------------------------------------
   Vì sao có tệp này: 63/63 bìa trong `data/registry.json` (đo ngày 24/09) là
   link NGOÀI — images.justwatch.com, m.media-amazon.com, pbs.twimg.com,
   blogger.googleusercontent.com. Nghĩa là:
     · kho của mình KHÔNG giữ byte nào của chúng → host kia gỡ ảnh là mất bìa;
     · mình không kiểm soát dung lượng → có host trả về ảnh 400–900 KB trong khi
       thẻ truyện chỉ hiện ~400 px.
   Hai hàm ở đây phục vụ việc "sao lưu + nén" (POST /api/admin/mirror-images):
     1) `shrinkRemoteImageUrl` — hỏi CHÍNH CDN đó một bản nhỏ hơn, bằng cách sửa
        URL theo luật riêng của từng host. Không cần tái mã hoá ảnh (Worker
        không có canvas, còn Cloudflare Images thì phải trả phí), vẫn nhẹ hơn
        nhiều và ảnh vẫn rõ vì các mốc dưới đây chọn theo kích thước hiển thị.
     2) `isOwnStorageUrl` — nhận ra ảnh đã nằm trong kho của mình
        (`/api/img/…` hoặc `<SUPABASE_URL>/storage/v1/object/public/…`) để bỏ qua,
        không tải lại chính ảnh của mình.
   Luật cố tình BẢO THỦ: không chắc luật của host thì trả null (giữ URL gốc),
   thà không nén còn hơn làm hỏng ảnh.
   ========================================================================== */

/* Kích thước cạnh dài muốn lấy cho từng loại ảnh (px).
   bìa: thẻ truyện ~400×600, hero ~700 → 800 là đủ nét trên màn hình 2x.
   ảnh chương: đọc trên điện thoại ~1000 px (bản upload cũng nén về 1440). */
export const MIRROR_EDGE = { cover: 800, chapter: 1200 };

export function isRemoteHttpUrl(u) {
  return /^https?:\/\//i.test(String(u || '').trim());
}

/* Ảnh đã nằm trong kho của mình? (không cần sao lưu lần nữa) */
export function isOwnStorageUrl(u, supabaseUrl) {
  const s = String(u || '').trim();
  if (!s) return false;
  if (/^\/api\/img\//.test(s)) return true;                 /* KV / stub của Worker */
  if (/^data:/i.test(s)) return true;                       /* base64 nhúng sẵn */
  const sb = String(supabaseUrl || '').replace(/\/+$/, '');
  if (sb && s.indexOf(sb + '/storage/v1/') === 0) return true;   /* Supabase Storage */
  return false;
}

/* Sửa URL để CDN trả bản nhỏ hơn. Trả null nếu host không có luật nào. */
export function shrinkRemoteImageUrl(u, maxEdge) {
  const raw = String(u || '').trim();
  if (!isRemoteHttpUrl(raw)) return null;
  const want = Math.max(160, parseInt(maxEdge, 10) || MIRROR_EDGE.cover);
  let host = '';
  try { host = new URL(raw).hostname.toLowerCase(); } catch (e) { return null; }

  /* 1) Blogger / Google user content:
        …/s1600/ten-anh.jpg   ·  …/s718-h957/…  ·  …=s1600  ·  …=w1200-h800
        Đổi mốc kích thước; thêm `-rw` để host tự mã hoá WebP khi được. */
  if (/(^|\.)googleusercontent\.com$/.test(host)) {
    /* /s1600/ten.jpg  ·  /s718-h957/…  ·  /w500-h300-p-k-no-nu/…  ·  …=s718  ·  ?s718 */
    let out = raw.replace(/\/s\d+(-[a-z0-9-]+)?\//i, '/s' + want + '-rw/');
    if (out === raw) out = raw.replace(/\/[wh]\d+(-[a-z0-9-]+)*\//i, '/s' + want + '-rw/');
    if (out === raw) out = raw.replace(/([?&=])[spwh]\d+/, '$1s' + want);
    if (out === raw && !/([?&=]|\))[spwh]\d+/.test(raw)) {
      out = raw + (raw.indexOf('?') >= 0 ? '&' : '=') + 's' + want;
    }
    return out === raw ? null : out;
  }

  /* 2) JustWatch: /poster/<id>/s718/<slug>.jpg → đổi mốc s718 */
  if (/(^|\.)justwatch\.com$/.test(host)) {
    const out = raw.replace(/\/s\d+\//i, '/s' + want + '/');
    return out === raw ? null : out;
  }

  /* 3) Amazon (media-amazon.com): _UX600_ / _UL500_ / _AC_UY400_ / _QL80_
        → ép cạnh dài về `want` và chất lượng 80. Ảnh cũ không có mốc nào thì
        chèn thêm `_UX<want>_QL80_` trước đuôi tệp. */
  if (/(^|\.)media-amazon\.com$/.test(host) || /(^|\.)amazon\.[a-z.]+$/.test(host)) {
    if (/_(UX|UL|UY|SX|SY|AC_UX|AC_UL)\d+_/i.test(raw)) {
      const out = raw.replace(/_(UX|UL|UY|SX|SY|AC_UX|AC_UL)\d+_/gi, '_UX' + want + '_')
        .replace(/_QL\d+_/gi, '_QL80_');
      return out === raw ? null : out;
    }
    const out = raw.replace(/(\.(jpg|jpeg|png|webp))($|[?#])/i, '_UX' + want + '_QL80_$1$3');
    return out === raw ? null : out;
  }

  /* 4) Twitter/X: ?format=webp&name=small|medium (small ≈ 680 px, medium ≈ 1200) */
  if (/(^|\.)twimg\.com$/.test(host)) {
    const name = want <= 700 ? 'small' : 'medium';
    const base = raw.split('?')[0];
    const out = base + '?format=webp&name=' + name;
    return out === raw ? null : out;
  }

  /* 5) Wikimedia: /thumb/…/600px-ten.png → đổi mốc px */
  if (/(^|\.)wikimedia\.org$/.test(host)) {
    const out = raw.replace(/\/(\d+)px-/, '/' + want + 'px-');
    return out === raw ? null : out;
  }

  return null;
}

/* <img src="http…"> trong HTML chương — chỉ lấy link http(s), bỏ data:/tương đối */
export function remoteImgSrcs(html) {
  const out = [];
  const re = /<img[^>]+src\s*=\s*("([^"]+)"|'([^']+)')/gi;
  let m;
  while ((m = re.exec(String(html || ''))) !== null) {
    const u = String(m[2] || m[3] || '').trim().replace(/&amp;/g, '&');
    if (/^https?:\/\//i.test(u) && out.indexOf(u) < 0) out.push(u);
  }
  return out;
}

/* link bìa NGOÀI trong registry (thumb/slide/cover) — thứ cần sao lưu */
export function remoteCoverRefs(reg) {
  const out = [];
  ((reg && reg.lib) || []).forEach((n) => {
    if (!n || !n.slug) return;
    ['thumb', 'slide', 'cover'].forEach((f) => {
      const u = String(n[f] || '').trim();
      if (/^https?:\/\//i.test(u) && out.indexOf(u) < 0) out.push(u);
    });
  });
  return out;
}
