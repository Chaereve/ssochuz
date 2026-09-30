/* ============================================================================
   version.js · NGUỒN SỐ PHIÊN BẢN DUY NHẤT (G10)
   ----------------------------------------------------------------------------
   Mọi nơi trong repo (package.json, worker/cms.js, worker/README.md,
   tools/build_worker.mjs) đều đối chiếu với hằng số VERSION ở đây qua
   `tools/check_version.mjs` (chạy tự động trong `npm test`).

   Muốn nâng phiên bản:
     node tools/check_version.mjs --write 1.19.0
   ========================================================================== */
export const VERSION = '1.18.0';
