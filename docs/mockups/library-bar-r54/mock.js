/* Dựng HTML cho 3 phương án thanh tìm & lọc — dùng chung index.html và frame.html */
(function () {
  var I = {
    search: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" /><path d="M21 21l-6 -6" /></g>',
    down: '<g stroke-width="1.2" transform="translate(-5.04 -5.04) scale(1.42)"><path d="M6 9l6 6l6 -6" /></g>',
    x: '<g stroke-width="1.44" transform="translate(-2.16 -2.16) scale(1.18)"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></g>',
    check: '<g stroke-width="1.9" transform="translate(-1.44 -1.44) scale(1.12)"><path d="M5 12l5 5l9 -10" /></g>',
    filter: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M4 4h16v2.172a2 2 0 0 1 -.586 1.414l-4.414 4.414v7l-6 2v-8.5l-4.48 -4.9a2 2 0 0 1 -.586 -1.414v-2.172" /></g>',
    sort: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M4 6h9" /><path d="M4 12h7" /><path d="M4 18h5" /><path d="M17 4v13" /><path d="M14 14l3 3l3 -3" /></g>'
  };
  function ic(n, cls) {
    return '<svg class="i ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (I[n] || '') + '</svg>';
  }
  /* ô chọn: span hiện đúng giá trị + select thật phủ trong suốt lên trên */
  function sels(label, opts, on) {
    return '<span class="lbs' + (on ? ' on' : '') + '">' +
      '<span class="val">' + opts[0] + '</span>' +
      '<select aria-label="' + label + '">' + opts.map(function (o) {
        return '<option>' + o + '</option>';
      }).join('') + '</select>' +
      '<span class="cv" aria-hidden="true">' + ic('down') + '</span></span>';
  }
  function q(big) {
    return '<label class="lbq">' + ic('search', 'ic') +
      '<input type="search" placeholder="Tìm truyện, tác giả, couple…" aria-label="Tìm trong thư viện">' +
      '<button class="cx" type="button" aria-label="Xoá ô tìm kiếm" title="Xoá">' + ic('x') + '</button>' +
      (big ? '' : '<span class="kbd" aria-hidden="true">⌘K</span>') +
      '</label>';
  }
  var head = '<div class="lbh"><h3>Thư viện</h3><span class="n">67 bộ</span>' +
    '<span class="p"><b>1–24</b> / 67</span></div>';

  /* ---------------- A · segmented control ---------------- */
  var A_STATUS = [['Tất cả', 67, 1], ['Hoàn thành', 46, 0], ['Đang cập nhật', 4, 0], ['Sắp ra mắt', 17, 0]];
  function barA() {
    return '<div class="barA">' + q() +
      '<div class="segA" role="group" aria-label="Lọc theo tình trạng">' +
        A_STATUS.map(function (s) {
          return '<button class="' + (s[2] ? 'on' : '') + '" aria-pressed="' + !!s[2] + '">' +
            s[0] + '<span class="c">' + s[1] + '</span></button>';
        }).join('') +
      '</div>' +
      '<div class="endA">' +
        '<span class="sepA" aria-hidden="true"></span>' +
        sels('Sắp xếp', ['Mới nhất', 'Năm mới nhất', 'Nhiều chương nhất', 'Tên A → Z']) +
        '<button class="lb18" type="button" aria-pressed="false">18+</button>' +
      '</div></div>';
  }

  /* ---------------- B · chip rail ---------------- */
  function barB() {
    return '<div class="barB">' +
      '<div class="rowB">' + q() +
        '<div class="endB">' +
          sels('Lọc theo năm', ['Mọi năm', '2026 (18)', '2025 (19)', '2024 (6)']) +
          '<span class="sepA" aria-hidden="true"></span>' +
          sels('Sắp xếp', ['Mới nhất', 'Năm mới nhất', 'Tên A → Z']) +
        '</div></div>' +
      '<div class="railB" role="group" aria-label="Lọc nhanh">' +
        '<button class="chipB on" aria-pressed="true">Tất cả<span class="c">67</span></button>' +
        '<button class="chipB" aria-pressed="false">Hoàn thành<span class="c">46</span></button>' +
        '<button class="chipB" aria-pressed="false">Đang cập nhật<span class="c">4</span></button>' +
        '<button class="chipB" aria-pressed="false">Sắp ra mắt<span class="c">17</span></button>' +
        '<span class="divB" aria-hidden="true"></span>' +
        '<button class="chipB plus" aria-pressed="false">18+<span class="c">29</span></button>' +
      '</div></div>';
  }

  /* ---------------- C · toolbar + popover ---------------- */
  function barC(withPop) {
    return '<div class="barC">' +
      '<div class="rowC">' + q() +
        '<div class="endC">' +
          '<button class="btnC" type="button">' + ic('filter') + 'Bộ lọc<span class="n">2</span></button>' +
          sels('Sắp xếp', ['Mới nhất', 'Năm mới nhất', 'Nhiều chương nhất', 'Tên A → Z']) +
        '</div></div>' +
      '<div class="actC">' +
        '<span class="cl">Đang lọc</span>' +
        '<span class="fchip">Tình trạng: Hoàn thành<button class="rm" aria-label="Bỏ lọc tình trạng">' + ic('x') + '</button></span>' +
        '<span class="fchip">18+<button class="rm" aria-label="Bỏ lọc 18+">' + ic('x') + '</button></span>' +
        '<button class="clr" type="button">Xoá tất cả</button>' +
      '</div>' +
      (withPop ? '<div class="poprow">' + popC() + '</div>' : '') +
    '</div>';
  }
  function popC() {
    var rowsA = [['Hoàn thành', 46, 1], ['Đang cập nhật', 4, 0], ['Sắp ra mắt', 17, 0]];
    return '<div class="popC">' +
      '<div class="ph"><b>Bộ lọc</b><button class="x" aria-label="Đóng">' + ic('x') + '</button></div>' +
      '<div class="pb">' +
        '<div class="grp"><div class="gl">Tình trạng</div>' +
          rowsA.map(function (r) {
            return '<button class="opt' + (r[2] ? ' on' : '') + '">' +
              '<span class="tick">' + ic('check') + '</span>' + r[0] + '<span class="c">' + r[1] + '</span></button>';
          }).join('') +
          '<button class="opt on"><span class="tick">' + ic('check') + '</span>18+<span class="c">29</span></button>' +
        '</div>' +
        '<div class="grp"><div class="gl">Năm ra mắt</div>' +
          '<button class="opt on"><span class="tick">' + ic('check') + '</span>Mọi năm</button>' +
          '<button class="opt"><span class="tick">' + ic('check') + '</span>2026<span class="c">18</span></button>' +
          '<button class="opt"><span class="tick">' + ic('check') + '</span>2025<span class="c">19</span></button>' +
        '</div>' +
      '</div>' +
      '<div class="pf"><button class="clr">Xoá lọc</button><button class="ok">Xong</button></div>' +
    '</div>';
  }

  window.MOCK = {
    head: head,
    /* withPop: bản C hiện thêm popover để thấy nội dung bên trong */
    build: function (o, withPop) {
      if (o === 'a') return head + barA();
      if (o === 'b') return head + barB();
      return head + barC(withPop);
    }
  };
})();
