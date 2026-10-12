/* ============================================================================
   ssochuz · registry sticker Sso duy nhất
   ----------------------------------------------------------------------------
   Dùng chung cho UI (picker / reaction / góp gạch / bình luận) và Worker
   (allowlist stickerId). Không lưu đường dẫn do client gửi lên; chỉ dùng path
   trong registry này. Giữ nguyên asset gốc ở public/stickers/sso/.
   ========================================================================== */
const stickerRows = [
  { id: 'sso-brick', label: 'Góp gạch', alt: 'Sso cầm viên gạch, góp động lực ra chương mới', title: 'Gạch động lực', category: 'Động lực', quick: true, fallback: '🧱' },
  { id: 'sso-love-it', label: 'Yêu thích', alt: 'Sso vui vẻ thể hiện sự yêu thích', title: 'Yêu thích', category: 'Cảm xúc', quick: true, fallback: '💗' },
  { id: 'sso-cry-flood', label: 'Khóc ngập lụt', alt: 'Sso khóc thành dòng nước mắt', title: 'Khóc ngập lụt', category: 'Cảm xúc', quick: true, fallback: '😭' },
  { id: 'sso-plot-twist', label: 'Plot twist!', alt: 'Sso bất ngờ trước tình tiết đảo chiều', title: 'Plot twist!', category: 'Phản ứng', quick: true, fallback: '😲' },
  { id: 'sso-popcorn-spy', label: 'Hóng chuyện', alt: 'Sso vừa ăn bỏng ngô vừa hóng chuyện', title: 'Hóng chuyện', category: 'Phản ứng', quick: true, fallback: '🍿' },
  { id: 'sso-more', label: 'Cho xin chương nữa', alt: 'Sso nài nỉ xin đọc thêm chương', title: 'Cho xin chương nữa', category: 'Động lực', quick: true, fallback: '🙏' },
  { id: 'sso-crown-chaos', label: 'Vương miện hỗn loạn', alt: 'Sso đội vương miện, tạo dáng đầy hỗn loạn', title: 'Vương miện hỗn loạn', category: 'Phản ứng', quick: false, fallback: '👑' },
  { id: 'sso-fighting', label: 'Cố lên!', alt: 'Sso cổ vũ và tiếp thêm tinh thần', title: 'Cố lên!', category: 'Động lực', quick: false, fallback: '💪' },
  { id: 'sso-flattened', label: 'Đứng hình', alt: 'Sso nằm bẹp vì bất ngờ', title: 'Đứng hình', category: 'Phản ứng', quick: false, fallback: '😵' },
  { id: 'sso-no-sleep', label: 'Cày đêm', alt: 'Sso thức khuya đọc truyện', title: 'Cày đêm', category: 'Động lực', quick: false, fallback: '🌙' },
  { id: 'sso-rage-roomba', label: 'Tức giận', alt: 'Sso bực bội chạy vòng vòng', title: 'Tức giận', category: 'Cảm xúc', quick: false, fallback: '😤' },
  { id: 'sso-secondhand-shame', label: 'Ngại giùm', alt: 'Sso xấu hổ thay cho nhân vật', title: 'Ngại giùm', category: 'Cảm xúc', quick: false, fallback: '🫣' },
  { id: 'sso-sugar-overload', label: 'Ngọt quá trời', alt: 'Sso thích thú vì khoảnh khắc ngọt ngào', title: 'Ngọt quá trời', category: 'Cảm xúc', quick: false, fallback: '🍬' },
  { id: 'sso-witness-protection', label: 'Tôi không thấy gì', alt: 'Sso giả vờ không nhìn thấy chuyện vừa xảy ra', title: 'Tôi không thấy gì', category: 'Phản ứng', quick: false, fallback: '🙈' },
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
