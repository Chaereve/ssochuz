/* ============================================================================
   ssochuz · registry sticker Sso duy nhất
   ----------------------------------------------------------------------------
   Dùng chung cho UI (picker / reaction / góp gạch / bình luận) và Worker
   (allowlist stickerId). Không lưu đường dẫn do client gửi lên; chỉ dùng path
   trong registry này. Giữ nguyên asset gốc ở public/stickers/sso/.
   ========================================================================== */
const stickerRows = [
  { id: 'sso-brick', label: 'Lẹ lẹ ik', alt: 'Sso cầm viên gạch, góp động lực ra chương mới', title: 'Lẹ lẹ ik', category: 'Động lực', quick: true, fallback: '🧱' },
  { id: 'sso-love-it', label: 'Toẹt', alt: 'Sso vui vẻ thể hiện sự yêu thích', title: 'Toẹt', category: 'Cảm xúc', quick: true, fallback: '💗' },
  { id: 'sso-cry-flood', label: 'Ulatr', alt: 'Sso khóc thành dòng nước mắt', title: 'Ulatr', category: 'Cảm xúc', quick: true, fallback: '😭' },
  { id: 'sso-plot-twist', label: 'Plot twist!', alt: 'Sso bất ngờ trước tình tiết đảo chiều', title: 'Plot twist!', category: 'Phản ứng', quick: true, fallback: '😲' },
  { id: 'sso-popcorn-spy', label: 'Hả?!', alt: 'Sso vừa ăn bỏng ngô vừa hóng chuyện', title: 'Hả?!', category: 'Phản ứng', quick: true, fallback: '🍿' },
  { id: 'sso-more', label: 'Cho xin chương nữa', alt: 'Sso nài nỉ xin đọc thêm chương', title: 'Cho xin chương nữa', category: 'Động lực', quick: true, fallback: '🙏' },
  { id: 'sso-crown-chaos', label: 'Yasss!!!', alt: 'Sso đội vương miện, tạo dáng đầy hỗn loạn', title: 'Yasss!!!', category: 'Phản ứng', quick: false, fallback: '👑' },
  { id: 'sso-fighting', label: 'Cố lên!', alt: 'Sso cổ vũ và tiếp thêm tinh thần', title: 'Cố lên!', category: 'Động lực', quick: false, fallback: '💪' },
  { id: 'sso-flattened', label: 'Xỉu tại chỗ...', alt: 'Sso nằm bẹp vì bất ngờ', title: 'Xỉu tại chỗ...', category: 'Phản ứng', quick: false, fallback: '😵' },
  { id: 'sso-no-sleep', label: 'Nốt chương nữa hoi', alt: 'Sso thức khuya đọc truyện', title: 'Nốt chương nữa hoi', category: 'Động lực', quick: false, fallback: '🌙' },
  { id: 'sso-rage-roomba', label: 'Cưng vô lây', alt: 'Sso bực bội chạy vòng vòng', title: 'Cưng vô lây', category: 'Cảm xúc', quick: false, fallback: '😤' },
  { id: 'sso-secondhand-shame', label: 'Ngại giùm', alt: 'Sso xấu hổ thay cho nhân vật', title: 'Ngại giùm', category: 'Cảm xúc', quick: false, fallback: '🫣' },
  { id: 'sso-sugar-overload', label: 'Ngọt quá trời', alt: 'Sso thích thú vì khoảnh khắc ngọt ngào', title: 'Ngọt quá trời', category: 'Cảm xúc', quick: false, fallback: '🍬' },
  { id: 'sso-witness-protection', label: 'Hong thấy gì hết nha', alt: 'Sso giả vờ không nhìn thấy chuyện vừa xảy ra', title: 'Hong thấy gì hết nha', category: 'Phản ứng', quick: false, fallback: '🙈' },
];

export const STICKERS = Object.freeze(stickerRows.map((row) => Object.freeze({
  ...row,
  thumb: '/stickers/sso/thumb/' + row.id + '.webp',
  full: '/stickers/sso/full/' + row.id + '.webp',
})));

export const STICKER_BY_ID = Object.freeze(STICKERS.reduce((out, row) => {
  out[row.id] = row;
  return out;
}, Object.create(null)));

export function getSticker(id) {
  return STICKER_BY_ID[String(id || '')] || null;
}
