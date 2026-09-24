/* ============================================================================
   ssochuz · KHOÁ CACHE BIÊN — bản DÙNG CHUNG cho Worker (và bài kiểm thử)
   ----------------------------------------------------------------------------
   Vì sao phải có: bản cũ chỉ lưu cache biên cho URL KHÔNG có query. Link được
   chia sẻ qua Facebook/Zalo/Gmail luôn kèm tham số rác (`?fbclid=…`,
   `?utm_source=…`) → MỌI lượt mở từ link chia sẻ đều đi thẳng vào KV. Bộ truyện
   trung bình 334 KB nằm trên KV: đông người vào từ một bài đăng Facebook là
   Worker đọc + phân tích JSON cả bộ cho từng người một (tốn lượt đọc KV, tốn
   CPU của Worker).

   Luật ở đây (cố tình BẢO THỦ):
     · Không có query                    → dùng thẳng URL sạch.
     · Chỉ có tham số RÁC (danh sách dưới) → bỏ hết, dùng URL sạch ⇒ mọi người
       cùng dùng CHUNG một bản lưu, không tạo khoá rác `?_=123`, `?fbclid=…`.
     · Còn tham số KHÁC (vd `token=` của truyện khoá mật mã) → trả '' ⇒ KHÔNG
       cache (BYPASS). Thà chậm hơn một chút còn hơn trả nhầm nội dung riêng
       của người khác hoặc để lộ chương khoá.
   ============================================================================ */

/* Tham số theo dõi/quảng cáo — không bao giờ đổi nội dung trả về. */
const JUNK_EXACT = new Set([
  '_', '_ga', '_gl', 'fbclid', 'gclid', 'dclid', 'gbraid', 'wbraid', 'msclkid',
  'twclid', 'ttclid', 'yclid', 'igshid', 'igsh', 'si', 'ref', 'ref_src', 'refsrc',
  'referrer', 'ref_url', 'spm', 'scm', 'sc_cid', 'fbc', 'fbp', 'vero_id', 'vero_conv',
  'wickedid', 'olark_id', '__s', 'mc_cid', 'mc_eid', 'mkt_tok', 'yclid_id',
  'utm', 'hsa_acc', 'hsa_cam', 'hsa_grp', 'hsa_ad', 'hsa_src', 'hsa_tgt',
  'hsa_kw', 'hsa_mt', 'hsa_net', 'hsa_ver', 'gad_source', 'srsltid', 'trk',
  'trkCampaign', 'trkInfo', 'ncid', 'cmpid', 'campaignid', 'source_id', 'share_id',
]);
const JUNK_PREFIX = ['utm_', 'pk_', 'mtm_', 'matomo_', 'piwik_', 'ga_', 'fb_'];

export function isJunkParam(name) {
  const k = String(name || '').trim();
  if (!k) return false;
  if (JUNK_EXACT.has(k)) return true;
  const low = k.toLowerCase();
  if (JUNK_EXACT.has(low)) return true;
  for (let i = 0; i < JUNK_PREFIX.length; i++) if (low.indexOf(JUNK_PREFIX[i]) === 0) return true;
  return false;
}

/* { url, removed, left } — url là URL ĐÃ BỎ tham số rác (giữ nguyên thứ tự các
   tham số còn lại), removed = số tham số bị bỏ, left = số tham số còn lại. */
export function stripJunkParams(raw) {
  let u;
  try { u = new URL(String(raw)); } catch (e) { return { url: String(raw || ''), removed: 0, left: 0 }; }
  if (!u.search) return { url: u.origin + u.pathname, removed: 0, left: 0 };
  const keep = [];
  let removed = 0;
  u.searchParams.forEach((v, k) => { if (isJunkParam(k)) removed++; else keep.push([k, v]); });
  const qs = keep.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
  return { url: u.origin + u.pathname + (qs ? '?' + qs : ''), removed, left: keep.length };
}

/* Khoá cache cho 1 URL đọc. '' = KHÔNG được cache (có tham số thật trong URL). */
export function cacheKeyOf(raw) {
  const r = stripJunkParams(raw);
  if (r.left > 0) return '';
  return r.url;
}
