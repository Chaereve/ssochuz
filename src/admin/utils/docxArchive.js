/* Đọc directory của ZIP trước khi Mammoth giải nén. DOCX 12 MB có thể chứa
   XML nén rất lớn: giới hạn tổng giải nén để tránh làm cạn RAM của trình duyệt.
   Không hỗ trợ ZIP64/multi-volume (không cần cho DOCX dưới 20 MB). */
export const MAX_DOCX_EXPANDED_BYTES = 64 * 1024 * 1024;
export function checkDocxArchive(buffer) {
  const view = new DataView(buffer);
  let end = -1;
  for (let i = view.byteLength - 22; i >= Math.max(0, view.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === view.byteLength) { end = i; break; }
  }
  if (end < 0) throw new Error('DOCX/ZIP không hợp lệ.');
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true), expanded = 0;
  const directoryEnd = offset + view.getUint32(end + 12, true);
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || count === 65535 || count > 10000 ||
      view.getUint16(end + 8, true) !== count || directoryEnd > end) throw new Error('DOCX/ZIP không hỗ trợ.');
  for (let i = 0; i < count; i++) {
    if (offset + 46 > directoryEnd || view.getUint32(offset, true) !== 0x02014b50) throw new Error('Directory DOCX lỗi.');
    expanded += view.getUint32(offset + 24, true);
    if (expanded > MAX_DOCX_EXPANDED_BYTES) throw new Error('Nội dung giải nén vượt 64 MB. Hãy chia file Word nhỏ hơn để tránh quá tải bộ nhớ.');
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
  if (offset !== directoryEnd) throw new Error('Directory DOCX lỗi.');
}
