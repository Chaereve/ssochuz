/* Dựng HTML thanh lọc cho từng phương án — dùng chung cho index.html và frame.html. */
(function () {
  var I = {
    search: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" /><path d="M21 21l-6 -6" /></g>',
    down: '<g stroke-width="1.2" transform="translate(-5.04 -5.04) scale(1.42)"><path d="M6 9l6 6l6 -6" /></g>',
    x: '<g stroke-width="1.44" transform="translate(-2.16 -2.16) scale(1.18)"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></g>'
  };
  function ic(n, cls) {
    return '<svg class="i ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + I[n] + '</svg>';
  }
  /* Ô chọn: hiển thị ĐÚNG chữ đang chọn bằng một <span>, còn <select> thật phủ
     trong suốt lên trên. Nhờ vậy hộp ôm sát chữ thay vì rộng bằng lựa chọn dài
     nhất trong danh sách (“Mọi tình trạng” làm hộp phình ra rất nhiều). */
  function sel(label, opts, on) {
    return '<span class="sl' + (on ? ' on' : '') + '">' +
      '<span class="val">' + opts[0] + '</span>' +
      '<select aria-label="' + label + '">' +
      opts.map(function (o) { return '<option>' + o + '</option>'; }).join('') +
      '</select><span class="cv" aria-hidden="true">' + ic('down') + '</span></span>';
  }

  window.MOCK = {
    head: function () {
      return '<div class="libHead"><h3>Thư viện</h3><span class="cnt">67 bộ</span>' +
        '<span class="cntPg"><b>1–24</b> / 67</span></div>';
    },
    bar: function (v) {
      var inner = '<div class="libTool ' + v + '">' +
        '<label class="q2">' + ic('search', 'ico') +
          '<input type="search" placeholder="Tìm truyện, tác giả, couple…" aria-label="Tìm trong thư viện">' +
          '<button class="cx" type="button" aria-label="Xoá ô tìm kiếm" title="Xoá">' + ic('x') + '</button>' +
        '</label>' +
        '<div class="fset">' +
          sel('Lọc theo năm', ['Mọi năm', '2026 (18)', '2025 (19)']) +
          sel('Lọc theo tình trạng', ['Hoàn thành (46)', 'Mọi tình trạng'], true) +
          sel('Sắp xếp', ['Mới nhất', 'Năm mới nhất', 'Tên A → Z']) +
          '<button class="t18" type="button" aria-pressed="false">18+</button>' +
          '<button class="clr2" type="button">Xoá lọc</button>' +
        '</div></div>';
      /* phương án 2: cả thanh nằm trên một dải chạy hết bề ngang */
      return v === 'v2' ? '<div class="band2">' + inner + '</div>' : inner;
    },
    /* Trên máy hẹp, nhãn dài “Hoàn thành (46)” không đủ chỗ trong 1/3 bề ngang
       nên bị cắt cụt. Cách xử lý khi port: bỏ phần “(46)” khi bề ngang < 720px
       (matchMedia) — số đếm vẫn còn trong danh sách xổ ra. */
    short: function (v) {
      var h = this.bar(v)
        .replace('2026 (18)', '2026').replace('2025 (19)', '2025')
        .replace('Hoàn thành (46)', 'Hoàn thành');
      return h;
    },
    full: function (v) { return this.head() + this.bar(v); }
  };
})();
