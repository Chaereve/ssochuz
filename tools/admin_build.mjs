/* ============================================================================
   tools/admin_build.mjs · THAM SỐ BUILD DÙNG CHUNG cho trang quản trị
   ----------------------------------------------------------------------------
   VÌ SAO tách riêng: `tools/build_site.mjs` sinh ra /admin.js, còn
   `tools/check_src.js` build lại rồi so TỪNG BYTE với /admin.js. Nếu hai nơi
   khai tham số esbuild khác nhau dù chỉ một chữ thì `npm test` sẽ báo lệch mà
   không ai hiểu vì sao. Vì thế chỉ có ĐÚNG MỘT nơi định nghĩa tham số: tệp này.

   Trang quản trị phải BUNDLE (khác các tệp cz-*.js của trang người đọc) vì nó
   nạp trình soạn thảo cài qua npm. Không CDN, không script ngoài.
   ========================================================================== */
import path from 'node:path';

const BANNER = '/* ssochuz · bản rút gọn — sửa ở src/ rồi chạy npm run build */';

/* Ngân sách: /admin.js sau minify không được vượt 650 kB (yêu cầu của chủ trang). */
export const ADMIN_BUDGET_BYTES = 650 * 1024;

export function adminBuildOptions(ROOT) {
  return {
    entryPoints: [path.join(ROOT, 'src/admin/main.js')],
    write: false,
    bundle: true,            /* BẮT BUỘC: gom TipTap và các module src/admin/* */
    format: 'iife',          /* một tệp <script> thường, không cần type=module */
    minify: true,
    legalComments: 'none',
    target: ['es2019'],
    charset: 'utf8',
    banner: { js: BANNER },
  };
}
