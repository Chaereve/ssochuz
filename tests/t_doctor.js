/* ============================================================================
   Bác sĩ dữ liệu · phần soi TRÙNG TIÊU ĐỀ CHƯƠNG (admin.js).
   Bài này KHÔNG cần jsdom: bóc thẳng 4 hàm chapWords/dupGroups/chapterGaps/dupText
   ra khỏi admin.js rồi chạy trên Node, vì bệnh "các tiêu đề lặp: 1 lần" nằm ở
   logic phân loại chứ không nằm ở giao diện.

   Điều quan trọng nhất phải giữ được: 2 loại trùng tiêu đề chữa NGƯỢC NHAU.
     · trùng tên + trùng chữ  = chương bị đăng 2 lần  → xoá 1 bản
     · trùng tên, khác chữ    = đặt tên/nhầm số chương → chỉ đổi tiêu đề (xoá là mất truyện)
   Nên mã tuyệt đối không được gộp chung rồi kết luận "thường là chương bị đăng trùng".

   Chạy: node tests/t_doctor.js
   ========================================================================== */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

/* admin.js là IIFE cho trình duyệt → không require được. Móc 4 hàm bằng cách cắt
   từ đúng tên hàm tới "function renderDoctor" rồi nạp vào 1 module tạm. */
function loadDoctor() {
  const src = fs.readFileSync(path.join(ROOT, 'admin.js'), 'utf8');
  const names = ['chapWords', 'dupGroups', 'chapterGaps', 'dupText'];
  const start = src.indexOf('  function chapWords(');
  const end = src.indexOf('  function renderDoctor()');
  if (start < 0 || end < 0) throw new Error('không tìm thấy khu vực Bác sĩ dữ liệu trong admin.js');
  const chunk = src.slice(start, end);
  names.forEach(n => {
    if (chunk.indexOf('function ' + n + '(') < 0) throw new Error('admin.js thiếu hàm ' + n);
  });
  const file = path.join(require('os').tmpdir(), 'chuseoz-doctor-fns.js');
  fs.writeFileSync(file, chunk + '\nmodule.exports=' + JSON.stringify(names) +
    '.reduce((o,k)=>(o[k]=eval(k),o),{});\n');
  return require(file);
}

const { dupGroups, chapterGaps, dupText } = loadDoctor();
const errors = [];
const out = {};
function ck(cond, msg) { if (!cond) errors.push(msg); }

function row(chs) {
  const dups = dupGroups(chs);
  return { dups: dups, gaps: dups.length ? chapterGaps(chs) : [] };
}
function say(r, same) { return dupText(r, same); }

/* ---------- 1. trùng tên, khác nội dung → phải là cảnh báo "đặt tên nhầm" ---------- */
const CH = (n) => [{ t: 'Bắt Đầu Đăng Ký', html: '<div>x</div>' }]
  .concat(Array.from({ length: 28 }, (_, i) => ({ t: 'Chương ' + (i + 1) + ': T' + i, html: '<div>nội dung ' + i + '</div>' })))
  .slice(0, n);
const mislabeled = CH(29);
mislabeled[17].t = 'Chương 16: Meow Meow';           // chương thứ 18 bị mang tên chương 16, như Be My Angel thật
mislabeled[16].t = 'Chương 16: Meow Meow';
const r1 = row(mislabeled);
out.trungTenKhacChu = { soNhom: r1.dups.length, same: r1.dups[0] && r1.dups[0].same, gaps: r1.gaps, lucCao: say(r1, false) };
ck(r1.dups.length === 1, 'ca lệch tên phải phát hiện đúng 1 nhóm trùng, thấy ' + r1.dups.length);
ck(r1.dups[0] && r1.dups[0].same === false, 'ca lệch tên mà báo same=true là sai — sẽ xui người dùng xoá mất 1 chương');
ck(JSON.stringify(r1.gaps) === '[17]', 'phải chỉ ra dãy chương nhảy số, thiếu Chương 17 · thấy ' + JSON.stringify(r1.gaps));
ck(/chữ khác nhau/.test(say(r1, false)) && /thiếu Chương 17/.test(say(r1, false)),
  'dòng giải thích phải nói rõ: chữ khác nhau + thiếu Chương 17 · thấy "' + say(r1, false) + '"');
ck(say(r1, true) === '', 'ca chỉ trùng tên thì không được báo là đăng trùng');

/* ---------- 2. trùng cả tên lẫn chữ → đúng là đăng trùng ---------- */
const repost = [
  { t: 'Chương 5: X', html: '<div>abc def</div>' },
  { t: 'Chương 5: X', html: '<div>abc def</div>' },
  { t: 'Chương 6: Y', html: '<div>q</div>' }
];
const r2 = row(repost);
out.dangTrungThat = { soNhom: r2.dups.length, same: r2.dups[0] && r2.dups[0].same, lucCao: say(r2, true) };
ck(r2.dups[0] && r2.dups[0].same === true, 'hai bản giống cả chữ phải bị xếp vào loại đăng trùng (same=true)');
ck(/chữ giống nhau/.test(say(r2, true)), 'dòng đăng trùng phải nói "chữ giống nhau" · thấy "' + say(r2, true) + '"');
ck(say(r2, false) === '', 'đăng trùng thật thì không báo nhầm sang loại đặt tên sai');

/* ---------- 3. so nội dung phải bỏ thẻ HTML: <p> vs <div>, khoảng trắng, &quot; ---------- */
const r3 = row([
  { t: 'Chương 9: K', html: '<p>Chào   cậu</p><p>&quot;nhé&quot;</p>' },
  { t: 'Chương 9: K', html: '<div> Chào cậu </div><div>"nhé"</div>' }
]);
out.soChuKhongSoThe = { same: r3.dups[0] && r3.dups[0].same };
ck(r3.dups[0] && r3.dups[0].same === true, '2 bản chỉ khác cách bọc thẻ/ký tự html thì vẫn phải coi là trùng nội dung');

/* ---------- 4. style/script không được tính là chữ ---------- */
const r4 = row([
  { t: 'Chương 2: A', html: '<style>.x{color:red}</style><div>giống nhau</div>' },
  { t: 'Chương 2: A', html: '<div>giống nhau</div><script>var a=1;</script>' }
]);
out.boStyleScript = { same: r4.dups[0] && r4.dups[0].same };
ck(r4.dups[0] && r4.dups[0].same === true, 'phải bỏ <style>/<script> trước khi so chữ');

/* ---------- 5. hai chương rỗng cùng tên → chưa kết luận được, đừng bảo "khác chữ" ---------- */
const r5 = row([{ t: 'Ngoại truyện', html: '' }, { t: 'Ngoại truyện', html: '   ' }]);
out.haiChuongRong = { same: r5.dups[0] && r5.dups[0].same, lucCao: say(r5, false) };
ck(r5.dups[0] && r5.dups[0].same === false, 'chương rỗng thì chưa đủ căn cứ nói là đăng trùng');
ck(/chưa so được vì chương rỗng/.test(say(r5, false)),
  'gặp chương rỗng thì phải nói "chưa so được", không được khẳng định "chữ khác nhau"');

/* ---------- 6. số chương lẻ tẻ (không nhảy) → đừng bịa ra gợi ý thiếu số ---------- */
const r6 = row([{ t: 'Ngoại truyện 1', html: 'a' }, { t: 'Ngoại truyện 1', html: 'b' }]);
out.khongDaySoChuong = { gaps: r6.gaps, lucCao: say(r6, false) };
ck(r6.gaps.length === 0, 'không có dãy "Chương n" thì gaps phải rỗng');
ck(!/thiếu Chương/.test(say(r6, false)), 'không được đoán thiếu số chương khi dữ liệu không đánh số');

/* ---------- 7. hồi quy trên dữ liệu THẬT: không bộ nào còn trùng tiêu đề ----------
   Be My Angel từng có 2 chương cùng tên "Chương 16: Meow Meow" (bản thứ hai thật ra là
   Chương 17) — sửa lại tên trong data/book/be-my-angel.json, giữ kiểm tra này để bệnh không quay lại. */
const books = fs.readdirSync(path.join(ROOT, 'data/book')).filter(f => f.endsWith('.json'));
const stillBad = [];
books.forEach(f => {
  let b = null;
  try { b = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/book', f), 'utf8')); }
  catch (e) { errors.push('data/book/' + f + ' không đọc được: ' + e.message); return; }
  const g = dupGroups((b && b.chapters) || []);
  if (g.length) stillBad.push(f.replace(/\.json$/, '') + ' → ' + g.map(x => '#' + x.at.join(', #') + ' "' + x.t + '"').join('; '));
});
out.kiemToanBoRepo = { soBo: books.length, conTrungTieuDe: stillBad };
ck(stillBad.length === 0, 'còn bộ lặp tiêu đề chương trong data/book: ' + stillBad.join(' | '));

out.errors = errors;
console.log(JSON.stringify(out, null, 1));
process.exit(errors.length ? 1 : 0);
