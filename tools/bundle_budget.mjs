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
  'cz.css':          { warnKb: 190, maxKb: 210 },
  /* admin.css KHÔNG còn là sheet phụ trợ: từ đợt tái cấu trúc giao diện quản trị
     (2026-10) nó phủ đủ 15 màn — khung app, bảng, form, khối vận hành, lớp nổi.
     Nâng trần 52 → 57 kB để chính sách cũ (warn ở ~88% trần) vẫn còn hiệu lực. */
  'admin.css':       { warnKb: 50,  maxKb: 57 },
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
