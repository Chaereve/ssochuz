/* Mockup thanh tìm/lọc thư viện — dùng đúng class + token của site.
   Mỗi phương án trả về một chuỗi HTML; index.html và frame.html cùng gọi. */
(function () {
  var ICONS = {
    search: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" /> <path d="M21 21l-6 -6" /></g>',
    down: '<g stroke-width="1.2" transform="translate(-5.04 -5.04) scale(1.42)"><path d="M6 9l6 6l6 -6" /></g>',
    x: '<g stroke-width="1.44" transform="translate(-2.16 -2.16) scale(1.18)"><path d="M18 6l-12 12" /> <path d="M6 6l12 12" /></g>',
    filter: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M4 4h16v2.172a2 2 0 0 1 -.586 1.414l-4.414 4.414v7l-6 2v-8.5l-4.48 -4.9a2 2 0 0 1 -.586 -1.414v-2.172" /></g>',
    grid: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M4 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-4" /> <path d="M14 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-4" /> <path d="M4 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-4" /> <path d="M14 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-4" /></g>',
    rows: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M13 5h8" /> <path d="M13 9h5" /> <path d="M13 15h8" /> <path d="M13 19h5" /> <path d="M4 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-4" /> <path d="M4 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-4" /></g>'
  };

  function ic(name, cls) {
    return '<svg class="i ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ICONS[name] || '') + '</svg>';
  }

  var CHIPS = [
    { l: 'Tất cả', c: 67, on: true },
    { l: 'Hoàn thành', c: 46 },
    { l: 'Đang cập nhật', c: 4 },
    { l: 'Sắp ra mắt', c: 17 },
    { l: '18+', c: 29 }
  ];

  function chips() {
    return CHIPS.map(function (t) {
      return '<button class="chip' + (t.on ? ' on' : '') + '" aria-pressed="' + !!t.on + '">' +
        t.l + '<b>' + t.c + '</b></button>';
    }).join('');
  }

  function chipsRow() {
    return '<div class="librow"><div class="libchips">' + chips() + '</div>' +
      '<div class="end"><span class="lcount">1–24 / 67</span></div></div>';
  }

  function searchBox(cls) {
    return '<label class="srch ' + (cls || '') + '">' + ic('search') +
      '<input type="search" placeholder="Tìm truyện, tác giả, couple…" aria-label="Tìm trong thư viện">' +
      '<kbd aria-hidden="true">⌘K</kbd></label>';
  }

  function dd(label, value, cls) {
    return '<span class="dd ' + (cls || '') + '"><span class="lb">' + label + '</span>' +
      '<select aria-label="' + label + '"><option>' + value + '</option></select>' +
      '<span class="cv" aria-hidden="true">' + ic('down') + '</span></span>';
  }

  function vseg() {
    return '<div class="end"><div class="seg vseg" role="group" aria-label="Kiểu hiển thị">' +
      '<button class="on" aria-label="Xem dạng lưới">' + ic('grid', 'i-s') + '</button>' +
      '<button aria-label="Xem dạng danh sách">' + ic('rows', 'i-s') + '</button></div></div>';
  }

  var V = {};

  /* ---- Hiện tại: ô tìm + 2 ô chọn + công tắc kiểu xem (hay bị rớt xuống dòng) ---- */
  V.base = '<div class="libbar">' + searchBox() + dd('Năm', 'Tất cả') +
    dd('Sắp xếp', 'Mới nhất') + vseg() + '</div>' + chipsRow();

  /* ---- A: y hệt hiện tại, chỉ bỏ công tắc kiểu xem ---- */
  V.a = '<div class="libbar">' + searchBox() + dd('Năm', 'Tất cả') +
    dd('Sắp xếp', 'Mới nhất') + '</div>' + chipsRow();

  /* ---- B: một hộp duy nhất, ngăn bằng kẻ tóc ---- */
  V.b = '<div class="barB">' + searchBox() + dd('Năm', 'Tất cả', 'ddB') +
    dd('Sắp xếp', 'Mới nhất', 'ddB') + '</div>' + chipsRow();

  /* ---- C: ô tìm là chính, lọc nằm dưới dạng chữ ---- */
  V.c = '<div class="barC">' + searchBox('big') +
    '<div class="cRow">' + dd('Năm', 'Tất cả', 'ddC') + dd('Sắp xếp', 'Mới nhất', 'ddC') +
    '<span class="lcount">1–24 / 67</span></div></div>' +
    '<div class="librow"><div class="libchips">' + chips() + '</div></div>';

  /* ---- D: một nút Lọc, mọi thứ vào tấm trượt ---- */
  V.d = '<div class="barD">' + searchBox() +
    '<button class="btnL">' + ic('filter', 'i-s') + 'Lọc<span class="n">2</span></button></div>' +
    '<div class="dBar"><div class="dActive">Đang lọc: <b>Hoàn thành</b> · <b>18+</b> · <b>2026</b>' +
    '<button class="lnk">Xoá lọc</button></div>' +
    '<span class="lcount">1–24 / 67</span></div>' +
    '<div class="sheetSketch"><div class="sh-h">Bộ lọc</div>' +
    '<div class="sh-r"><span>Năm</span><b>Tất cả ▾</b></div>' +
    '<div class="sh-r"><span>Sắp xếp</span><b>Mới nhất ▾</b></div>' +
    '<div class="sh-r"><span>Tình trạng</span><div class="libchips">' + chips() + '</div></div>' +
    '<div class="sh-f"><button class="lnk">Xoá lọc</button><button class="btnL">Xong</button></div></div>';

  window.MOCK = {
    variants: [
      { k: 'base', l: 'Hiện tại' },
      { k: 'a', l: 'A · Bỏ công tắc' },
      { k: 'b', l: 'B · Một hộp, ba ngăn' },
      { k: 'c', l: 'C · Tìm là chính' },
      { k: 'd', l: 'D · Một nút Lọc' }
    ],
    html: function (k) { return V[k] || ''; }
  };
})();
