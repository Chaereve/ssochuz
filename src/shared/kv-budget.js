/* ============================================================================
   NHỊP GHI KV DÙNG CHUNG (worker/cms.js + bài kiểm thử)
   ----------------------------------------------------------------------------
   Gói miễn phí của Cloudflare cho 1.000 lượt GHI + 1.000 lượt LIST mỗi ngày
   (hạn mức reset 00:00 UTC). Bản ≤ 1.14.0 ghi khoá `stats` mỗi 10 giây bất kể
   có ai xem hay không → riêng một khoá đã 8.640 lượt/ngày, vượt hạn mức và
   khiến MỌI thao tác ghi (số liệu, phiếu, lưu chương) bắt đầu lỗi.
   Tệp này gom các con số và công thức chia nhịp để Worker dùng chung, còn bài
   kiểm thử kiểm tra được phần tính toán mà không phải chờ đồng hồ thật.
   ============================================================================ */
export const KV_FLUSH = {
  events: 25,        /* đệm đủ 25 thay đổi trong RAM → ghi ngay (web đông) */
  eventsTimer: 3,    /* tới giờ hẹn: từ 3 thay đổi trở lên là ghi */
  timerMs: 30000,    /* giờ hẹn ghi — waitUntil chỉ giữ isolate sống ≤ 30 giây */
  holdMs: 600000,    /* giữ trong RAM tối đa 10 phút, quá thì ghi cho chắc */
  budget: 240,       /* trần lượt ghi khoá `stats` mỗi ngày (chừa chỗ cho việc khác) */
  slack: 3,          /* cho phép vượt “tem” vài lượt cho khỏi ghi chậm tay */
  forcedMsMax: 30000, /* STATS_FLUSH_MS (bài kiểm thử) tối đa 30 giây */
  budgetMax: 5000,   /* STATS_WRITE_BUDGET tối đa nhận */
};

/* Trần lượt ghi khoá `stats` mỗi ngày: biến STATS_WRITE_BUDGET ghi đè khi cần */
export function statsBudget(env) {
  const n = parseInt((env && env.STATS_WRITE_BUDGET) || '', 10);
  return n > 0 ? Math.min(n, KV_FLUSH.budgetMax) : KV_FLUSH.budget;
}
/* Ép nhịp bằng STATS_FLUSH_MS (chỉ dùng lúc thử nghiệm); 0 = dùng ngân sách */
export function forcedFlushMs(env) {
  const n = parseInt((env && env.STATS_FLUSH_MS) || '', 10);
  return n > 0 ? Math.min(n, KV_FLUSH.forcedMsMax) : 0;
}
/* Còn bao nhiêu giây nữa là hết ngày UTC (mốc Cloudflare reset hạn mức) */
export function secondsToUtcMidnight(now) {
  const d = new Date(now == null ? Date.now() : now);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return Math.max(1, Math.round((next - d.getTime()) / 1000));
}
/* “Tem” hạn mức đã được dùng tới lúc này: ngân sách chia đều cho 24 giờ UTC.
   Ví dụ ngân sách 240 → 10 giờ UTC thì được phép đã ghi 100 lượt. */
export function budgetCredits(env, now) {
  const d = new Date(now == null ? Date.now() : now);
  const startOfDay = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const secsToday = Math.max(0, (d.getTime() - startOfDay) / 1000);
  return statsBudget(env) * secsToday / 86400;
}
/* Tới giờ hẹn thì có nên ghi không?
     · web đông (đệm đủ `eventsTimer` thay đổi) → ghi;
     · bản trong RAM đã giữ quá `holdMs` → ghi cho khỏi mất số;
     · còn “tem” của ngày (used < credits + slack) → ghi cho số liệu tươi.
   Hết ngân sách và không gấp thì NẰM CHỜ trong RAM — /api/stats vẫn cộng phần
   đang đệm nên người đọc không thấy thiếu số. */
export function flushOnTimer({ ops, heldMs, used, credits }) {
  if (ops >= KV_FLUSH.eventsTimer) return true;
  if (heldMs >= KV_FLUSH.holdMs) return true;
  return used < credits + KV_FLUSH.slack;
}
/* Số lượt ghi tối đa của một ngày khi chỉ có nhịp theo thời gian (không kể
   những lần ghi do web đông hoặc do giữ quá lâu) — dùng để kiểm thử. */
export function dayFlushCeiling(env) {
  return statsBudget(env) + KV_FLUSH.slack;
}
