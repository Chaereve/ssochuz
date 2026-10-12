/* ============================================================================
   bundle-budget.js · NGƯỠNG CẢNH BÁO VÀ TRẦN DUNG LƯỢNG BẢN BUILD (Milestone C)
   ----------------------------------------------------------------------------
   Mỗi tệp phát hành ở thư mục gốc có:
     · warnKb: ngưỡng cảnh báo mềm — `npm run build` in cảnh báo ⚠ ngay khi vượt
       để người phát triển biết tệp đang phình lên trước khi chạm trần.
     · maxKb:  trần cứng — `npm test` (`tests/t_admin_budget.js`) chặn nếu vượt.
   ========================================================================== */
export const BUNDLE_BUDGETS = {
  'cz-app.js':       { warnKb: 110, maxKb: 125 },
  'cz-auth.js':      { warnKb: 28,  maxKb: 35 },
  'cz-home.js':      { warnKb: 28,  maxKb: 35 },
  'cz-story.js':     { warnKb: 78,  maxKb: 90 },
  'cz-people.js':    { warnKb: 10,  maxKb: 15 },
  'cz-space.js':     { warnKb: 34,  maxKb: 42 },
  /* 1.19.0 — bộ tương tác (reaction sticker, hộp gạch, vòng quay). Ba tệp này
     chỉ nạp ở trang thật sự dùng nên vẫn có trần riêng, khá chặt. */
  'cz-react.js':     { warnKb: 19,  maxKb: 22 },   /* âm thanh đã gộp sang cz-app.js (1.19.0) */
  'cz-brick.js':     { warnKb: 8,   maxKb: 12 },
  'cz-dice.js':      { warnKb: 13,  maxKb: 18 },
  'cz.css':          { warnKb: 195, maxKb: 215 },
  /* v6: nâng có chủ đích (giao diện admin kiểu Wattpad: bố cục hai cột, bìa lớn,
     trạng thái đầy đủ). Vẫn có trần — tăng thêm phải ghi lý do ở đây. */
  'admin.css':       { warnKb: 70,  maxKb: 84 },
  'admin.js':        { warnKb: 230, maxKb: 260 },
  'admin-editor.js': { warnKb: 400, maxKb: 420 },
  'admin-docx.js':   { warnKb: 430, maxKb: 460 },
};

/**
 * Đánh giá kích thước 1 tệp build so với ngân sách.
 * @param {string} file
 * @param {number} bytes
 */
export function evaluateBundleFile(file, bytes) {
  const b = BUNDLE_BUDGETS[file];
  const kb = +(bytes / 1024).toFixed(1);
  if (!b) return { file, bytes, kb, status: 'untracked', pct: 0, message: '' };
  const pct = Math.round((bytes / (b.maxKb * 1024)) * 100);
  if (bytes > b.maxKb * 1024) {
    return {
      file, bytes, kb, warnKb: b.warnKb, maxKb: b.maxKb, pct,
      status: 'exceeded',
      message: `${file} (${kb} kB) VƯỢT TRẦN ${b.maxKb} kB (${pct}%)`,
    };
  }
  if (bytes > b.warnKb * 1024) {
    return {
      file, bytes, kb, warnKb: b.warnKb, maxKb: b.maxKb, pct,
      status: 'warn',
      message: `${file} (${kb} kB) chạm ngưỡng cảnh báo ${b.warnKb} kB (trần ${b.maxKb} kB, ${pct}%)`,
    };
  }
  return { file, bytes, kb, warnKb: b.warnKb, maxKb: b.maxKb, pct, status: 'ok', message: '' };
}
