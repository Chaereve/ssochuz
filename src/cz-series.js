/* ============================================================================
   ssochuz · TRANG CHUYỂN THỂ SERIES (đích của nút "Xem thêm" ở trang chủ)
   ----------------------------------------------------------------------------
   Vòng 15 cho admin chọn KHÔNG GIỚI HẠN số bộ (card vẫn hiện 12). Trang chủ
   renderEditorChoice() chỉ vẽ 8 tấm 16:10 đầu tiên; các bộ còn lại trước vòng 16
   không có đường ra ngoài web. Trang này đọc đúng editorChoice từ KV/registry và
   vẽ TOÀN BỘ bằng CZ.card() — cùng kiểu thẻ, cùng dữ liệu thật với Thư viện.
   Không có danh sách mẫu, không tự bịa bộ khi KV rỗng.
   ========================================================================== */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  CZ.mountShell({ active: 'home' });
  function render(reg) {
    var grid = $('#seriesGrid'), count = $('#seriesCount');
    if (!grid) return;
    var list = [];
    try { CZ._setLib(); list = CZ.editorChoice(reg) || []; } catch (e) { list = []; }
    if (count) count.textContent = list.length + ' bộ';
    if (!list.length) {
      grid.innerHTML = '<p class="empty" style="grid-column:1/-1">Chủ trang chưa chọn bộ nào cho Chuyển thể Series.</p>';
      return;
    }
    grid.innerHTML = list.map(function (n) { return CZ.card(n); }).join('');
    if (CZ.inkAll) CZ.inkAll();
    if (CZ.reveal) CZ.reveal();
  }
  function fail(e) {
    if (window.console && console.warn) console.warn('[ssochuz]', 'lỗi tải Chuyển thể Series', e || '');
    var grid = $('#seriesGrid');
    if (grid) grid.innerHTML = '<p class="empty" style="grid-column:1/-1">Chưa tải được dữ liệu truyện. Kiểm tra mạng rồi tải lại trang.</p>';
    var count = $('#seriesCount');
    if (count) count.textContent = '—';
  }
  CZ.registry().then(function (r) { render(r && r.reg); }).catch(fail);
})();
