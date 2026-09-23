/* ============================================================================
   Kiểm thử BỘ NHẬN DIỆN CHƯƠNG DÙNG CHUNG (src/shared/chapters.js)
   · corpus: Lời mở đầu / Giới thiệu nhân vật / Chương 0 KHÔNG tính là Chương 1
   · parity: parser nạp trực tiếp (Node) == parser bên trong bản rút gọn cz-app.js
   · trang truyện: danh sách chương gom đúng nhóm Mở đầu / Chương / Ngoại truyện,
     nhãn hiển thị Mở · S1 · 1 … theo số trong TÊN chương, không theo vị trí
   · bộ 0 chương trên Worker: trang truyện vẫn MỞ ĐƯỢC (không rớt về /data 404)
   · splitChaptersTxt: nhận diện tiêu đề mở đầu/ngoại truyện, đánh số theo chương chính
   Chạy:  node tests/t_chapters.js
   Điều kiện đạt: mọi khoá "errors*" là [] và thoát mã 0.
   ========================================================================== */
const { page } = require('./mk');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const out = {};
  const errs = [];
  const eq = (name, got, want) => {
    if (String(got) !== String(want)) errs.push(name + ' (nhận: ' + JSON.stringify(got) + ', cần: ' + JSON.stringify(want) + ')');
  };
  const ok = (name, cond, extra) => {
    if (!cond) errs.push(name + (extra != null ? '  → ' + JSON.stringify(extra).slice(0, 160) : ''));
  };

  /* ---------- 1. corpus parser (import trực tiếp) ---------- */
  const shared = await import('../src/shared/chapters.js');
  const { parseChapterTitle: parse, nextMainChapterNo, chapterIsEmpty } = shared;
  const corpus = [
    ['Lờ'+'i mở đầu', 'open', 0, false],
    ['Lờ'+'i Mở Đầu: Khởi nguồn', 'open', 0, false],
    ['Prologue', 'open', 0, false],
    ['Giới thiệu nhân vật', 'open', 0, false],
    ['Giới thiệu truyện', 'open', 0, false],
    ['Nhân vật chính', 'open', 0, false],
    ['Thông báo nghỉ 1 tuần', 'open', 0, false],
    ['Chương 0', 'open', 0, true],
    ['Chương 0: Mở màn', 'open', 0, true],
    ['Chương 1: Gặp gỡ', 'main', 1, true],
    ['Chương 12', 'main', 12, true],
    ['Chương 12.5: Xen kẽ', 'main', 12.5, true],
    ['Chap 3', 'main', 3, true],
    ['Chapter iv', 'main', 4, true],
    ['Hồi 2', 'main', 2, true],
    ['Quyển 3: Đại chiến', 'main', 3, true],
    ['Tập 7', 'main', 7, true],
    ['Ngoại truyện', 'extra', 0, false],
    ['Ngoại truyện 2: Tết', 'extra', 2, true],
    ['Phụ chương 1', 'extra', 1, true],
    ['Chương 15: Ngoại truyện Tết', 'extra', 15, true],
    ['Epilogue: Lờ'+'i bạt', 'extra', 0, false],
    ['Đêm khuya', 'main', 0, false],
  ];
  corpus.forEach(([title, kind, no, has], i) => {
    const p = parse(title);
    eq('corpus[' + i + '] kind ' + title, p.kind, kind);
    eq('corpus[' + i + '] no ' + title, p.no, no);
    eq('corpus[' + i + '] has ' + title, p.has, has);
  });
  /* gợi ý số chương chính kế tiếp */
  eq('next/mở đầu không tính', nextMainChapterNo([{ t: 'Lờ'+'i mở đầu' }, { t: 'Giới thiệu nhân vật' }]), 1);
  eq('next/sau chương 0', nextMainChapterNo([{ t: 'Chương 0' }]), 1);
  eq('next/max chính', nextMainChapterNo([{ t: 'Ngoại truyện 3' }, { t: 'Chương 5' }, { t: 'Chương 12' }]), 13);
  eq('next/thập phân', nextMainChapterNo([{ t: 'Chương 12.5' }]), 13);
  eq('next/trống', nextMainChapterNo([]), 1);
  /* chương chỉ có hình KHÔNG rỗng */
  eq('empty/img', chapterIsEmpty('<p><img src="/api/img/x"></p>'), false);
  eq('empty/figure', chapterIsEmpty('<figure><img src="x"></figure>'), false);
  eq('empty/hr', chapterIsEmpty('<hr>'), false);
  eq('empty/p trống', chapterIsEmpty('<p><br></p>'), true);
  eq('empty/nbsp', chapterIsEmpty('<p>&nbsp;</p>'), true);
  eq('empty/text', chapterIsEmpty('<p>xin chào</p>'), false);

  /* ---------- 2. parity với bản rút gọn ( cz-app.js trong jsdom ) ---------- */
  {
    const p0 = page('index.html', {
      url: 'https://ssochuz.pages.dev/',
      fetch: () => Promise.resolve({ ok: false, status: 404, json: async () => ({}), text: async () => '' }),
    });
    await wait(900);
    const CZ = p0.win.CZ;
    ok('CZ.chapInfo tồn tại', typeof CZ.chapInfo === 'function');
    corpus.forEach(([title, kind, no, has], i) => {
      const p = CZ.chapInfo(title);
      eq('parity[' + i + '] kind ' + title, p.kind, kind);
      eq('parity[' + i + '] no ' + title, p.no, no);
      eq('parity[' + i + '] has ' + title, p.has, has);
    });
    eq('parity/chapNextNo', CZ.chapNextNo([{ t: 'Giới thiệu nhân vật' }, { t: 'Chương 2' }]), 3);
    eq('parity/chapEmpty', CZ.chapEmpty('<p><img src="x"></p>'), false);
    out.parityErrors = p0.errors.slice(0, 4);
  }

  /* ---------- 3. trang truyện: nhãn chương theo parser dùng chung ---------- */
  const BASE = 'https://cms.test';
  const METAS = {
    'thu-so': {
      title: 'Bộ Thử Số', slug: 'thu-so', author: 'TG', couple: '', year: '2026',
      status: 'Đang cập nhật', chapters: 6, countLabel: '6/6', updated: '2026-09-20', syn: 'Mô tả thử',
    },
    'chua-co-chuong': {
      title: 'Bộ Chưa Có Chương', slug: 'chua-co-chuong', author: 'TG', couple: '', year: '2026',
      status: 'Sắp ra mắt', chapters: 0, countLabel: '0/—', updated: '2026-09-21', syn: 'Truyện mới tạo',
    },
  };
  const BOOKS = {
    'thu-so': {
      title: 'Bộ Thử Số', slug: 'thu-so', author: 'TG', chapters: [
        { t: 'Lờ'+'i mở đầu', html: '<p>prologue</p>' },
        { t: 'Giới thiệu nhân vật', html: '<p>nhân vật</p>' },
        { t: 'Chương 0: Trước khi bắt đầu', html: '<p>chương 0</p>' },
        { t: 'Chương 1: Gặp gỡ', html: '<p>một ngày nọ dài thật dài</p>' },
        { t: 'Chương 2: Tình cờ', html: '<p>ngày khác cũng thật dài</p>' },
        { t: 'Ngoại truyện 1: Tết', html: '<p>đặc biệt</p>' },
      ],
    },
    'chua-co-chuong': { title: 'Bộ Chưa Có Chương', slug: 'chua-co-chuong', author: 'TG', chapters: [] },
  };
  const J = (b, okk, st) => Promise.resolve({
    ok: okk !== false, status: st || 200,
    json: () => Promise.resolve(b), text: () => Promise.resolve(JSON.stringify(b)),
  });
  const storyFetch = (url) => {
    url = String(url);
    if (url.startsWith(BASE + '/api/registry')) return J({ rev: 't', lib: Object.values(METAS) });
    const m = url.match(new RegExp(BASE.replace(/\./g, '\\.') + '\\/api\\/book\\/([^?]+)'));
    if (m) {
      const slug = decodeURIComponent(m[1]);
      if (BOOKS[slug]) return J(BOOKS[slug]);
      return J({ ok: false, error: '404' }, false, 404);
    }
    if (url.startsWith(BASE + '/api/stats')) return J({ ok: true, items: {} });
    if (url.startsWith('/') && url.includes('/data/registry.json')) return J({ lib: Object.values(METAS) });
    return J({}, false, 404);
  };

  {
    const p = page('truyen.html', { url: 'https://ssochuz.pages.dev/truyen/thu-so/', config: { CZ_API: BASE }, fetch: storyFetch });
    await wait(1600);
    const { doc, errors } = p;
    const $ = (s) => doc.querySelector(s), $$ = (s) => [...doc.querySelectorAll(s)];
    out.storyErrors = errors.slice(0, 4);
    /* thông tin bộ */
    eq('truyện/tiêu đề', ($('#shero h1') || {}).textContent, 'Bộ Thử Số');
    ok('truyện/tổng chương hiển thị', (($('#chapCount') || {}).textContent || '').includes('6 chương'), (($('#chapCount') || {}).textContent || ''));
    /* nhóm chương */
    const groups = $$('#chapGrid .cvol').map((b) => b.textContent.trim().replace(/\s+/g, ' '));
    ok('truyện/có nhóm Mở đầu', groups.some((g) => /mở đầu/i.test(g)), groups);
    ok('truyện/có nhóm Ngoại truyện', groups.some((g) => /ngoại truyện|đặc biệt/i.test(g)), groups);
    /* nhãn số: Mở · Mở · Mở · 1 · 2 · S1 */
    const labels = $$('#chapGrid .cha .no').map((e) => e.textContent.trim());
    const names = $$('#chapGrid .cha .nm').map((e) => e.textContent.trim());
    ok('truyện/3 nhãn Mở', labels.filter((x) => x === 'Mở').length === 3, labels);
    ok('truyện/có S1', labels.includes('S1'), labels);
    ok('truyện/số 1-2', labels.includes('1') && labels.includes('2'), labels);
    ok('truyện/giới thiệu nhân vật nằm trong danh sách', names.some((n) => /nhân vật/i.test(n)), names);
    /* khối main KHÔNG được tính mở đầu/gtnv là chương 1: “Chương 1: Gặp gỡ” giữ số 1 */
    const mainRow = $$('#chapGrid .cha').find((a) => /Gặp gỡ/.test(a.textContent));
    ok('truyện/Chương 1 giữ đúng số', mainRow && (mainRow.querySelector('.no') || {}).textContent === '1',
      mainRow ? mainRow.textContent : '<không thấy>');
    /* thứ tự nhãn đúng: Mở ×3 trước, rồi 1, 2, rồi S1 — nhãn lấy từ TÊN chương,
       không đếm phần mở đầu/ngoại truyện vào số chương chính */
    eq('truyện/thứ tự nhãn', labels.join('|'), ['Mở', 'Mở', 'Mở', '1', '2', 'S1'].join('|'));
    ok('truyện/có ô nhảy chương', !!$('#chapJump'));
  }

  /* ---------- 4. bộ 0 chương trên Worker vẫn mở được trang truyện ---------- */
  {
    const p = page('truyen.html', { url: 'https://ssochuz.pages.dev/truyen/chua-co-chuong/', config: { CZ_API: BASE }, fetch: storyFetch });
    await wait(1600);
    const { doc, errors } = p;
    const $ = (s) => doc.querySelector(s);
    out.zeroErrors = errors.slice(0, 4);
    eq('0chương/tiêu đề vẫn hiện', ($('#shero h1') || {}).textContent, 'Bộ Chưa Có Chương');
    /* showError() thay #shero bằng hộp lỗi và ẩn #chapSec — kiểm trạng thái NHÌN
       THẤY thay vì regex toàn body (script inline chứa sẵn các chuỗi lỗi) */
    ok('0chương/vẫn hiện mục lục (không rơi vào showError)', !!$('#chapSec') && $('#chapSec').style.display !== 'none',
      $('#chapSec') && $('#chapSec').style.display);
    /* thiết kế: bộ chưa ra chương để TRỐNG ô đếm — nhãn “Sắp ra mắt” đã ở đầu trang */
    eq('0chương/ô đếm để trống', (($('#chapCount') || {}).textContent || '').trim(), '');
    const heroTxt = ((($('#shero') || doc).textContent || '')).replace(/\s+/g, ' ');
    ok('0chương/nút đọc khoá sắp ra mắt', /sắp ra mắt|chưa có chương/i.test(heroTxt), heroTxt.slice(0, 160));
  }

  /* ---------- 5. splitChaptersTxt (nhập .txt trong trang quản trị) ---------- */
  const { splitChaptersTxt } = await import('./' + 'helpers_txt.mjs').catch(() => ({}));
  if (splitChaptersTxt) {
    const txt = 'Lờ'+'i mở đầu' + '\n\nBức thư gửi tới ngưở'+'i đọc.'
      + '\nGiới thiệu nhân vật\n\nAn và Bình.'
      + '\nChương 1: Gặp nhau\n\nBuổi sáng hôm ấy…\n\nChương 2\n\nChiều hôm sau…'
      + '\nNgoại truyện 1\n\nChuyện tết…';
    const parts = splitChaptersTxt(txt);
    eq('split/số phần', parts.length, 5);
    eq('split/[0] mở đầu giữ tên', parse(parts[0].t).kind, 'open');
    eq('split/[1] gtnv giữ tên', parse(parts[1].t).kind, 'open');
    eq('split/[2] chương 1 số', parse(parts[2].t).no, 1);
    eq('split/[4] ngoại truyện', parse(parts[4].t).kind, 'extra');
    /* file bắt đầu bằng prologue không heading: phần đầu được đánh tên theo chương chính kế tiếp */
    const p2 = splitChaptersTxt('Đây là đoạn mở đầu không tiêu đề, nội dung dài.\n\nThêm đoạn nữa.\nChương 2: Bắt đầu\n\nNội dung chương 2.');
    eq('split/không heading → nhận số từ chương kế', parse(p2[0].t).no, 1);
    eq('split/sau đó là chương 2', parse(p2[1].t).no, 2);
  } else {
    errs.push('splitChaptersTxt không import được');
  }

  out.errors0 = errs.slice(0, 12);
  console.log(JSON.stringify(out, null, 2));
  if (errs.length) { console.log('CÒN ' + errs.length + ' LỖI'); process.exit(1); }
  console.log('ĐẠT: parser chương dùng chung + trang truyện + nhập .txt');
  process.exit(0);
})().catch((e) => { console.log(JSON.stringify({ errors0: ['ngoại lệ: ' + (e && e.stack || e)] }, null, 1)); process.exit(1); });
