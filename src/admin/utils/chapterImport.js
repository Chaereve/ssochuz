import { splitChaptersTxt } from './richTextEditor.js';
import { splitChaptersHtml, abortImport } from './docxChapters.js';

export const MAX_CHAPTER_FILE_BYTES = 20 * 1024 * 1024;
// Worker /api/book từ chối JSON UTF-8 >24 MiB, không phải kích thước DOCX nén.
export const MAX_BOOK_BYTES = 24 * 1024 * 1024;
export const jsonBytes = (value) => new Blob([JSON.stringify(value)]).size;
export function importSizeLabel(bytes) {
  return bytes >= 1024 * 1024 ? (bytes / 1024 / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' MB' :
    (bytes / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' KB';
}

function readFile(file, binary, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) { reject(abortImport()); return; }
    const reader = new FileReader();
    const cleanup = () => signal && signal.removeEventListener('abort', abort);
    const abort = () => { cleanup(); reader.abort(); reject(abortImport()); };
    reader.onload = () => { cleanup(); resolve(reader.result); };
    reader.onerror = () => { cleanup(); reject(new Error('Không đọc được file. Hãy chọn lại file.')); };
    reader.onabort = () => { cleanup(); reject(abortImport()); };
    if (signal) signal.addEventListener('abort', abort, { once: true });
    try {
      if (binary) reader.readAsArrayBuffer(file);
      else reader.readAsText(file);
    } catch (error) { cleanup(); reject(new Error('Không đọc được file. Hãy chọn lại file.')); }
  });
}

function convertDocx(arrayBuffer, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) { reject(abortImport()); return; }
    if (typeof Worker === 'undefined') { reject(new Error('Trình duyệt chưa hỗ trợ đọc Word nền. Hãy dùng Chrome, Edge, Firefox hoặc Safari mới.')); return; }
    let worker, timer;
    const finish = (error, result) => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', abort);
      if (worker) worker.terminate();
      if (error) reject(error); else resolve(result);
    };
    const abort = () => finish(abortImport());
    try {
      worker = new Worker('/admin-docx.js?v=20260926b');
      worker.onmessage = ({ data }) => {
        if (!data || typeof data.html !== 'string') finish(new Error(data && data.error || 'Không đọc được file DOCX.'));
        else finish(null, data);
      };
      worker.onerror = (event) => {
        event.preventDefault();
        finish(new Error('Không tải được bộ đọc Word. Kiểm tra mạng rồi thử lại.'));
      };
      worker.onmessageerror = () => finish(new Error('Không nhận được nội dung Word. Hãy thử lại.'));
      timer = setTimeout(() => finish(new Error('Đọc Word quá 90 giây. Hãy chia file nhỏ hơn rồi thử lại.')), 90000);
      if (signal) signal.addEventListener('abort', abort, { once: true });
      // Chuyển quyền sở hữu buffer, không nhân đôi file 12–20 MB trong bộ nhớ.
      worker.postMessage(arrayBuffer, [arrayBuffer]);
    } catch (error) {
      finish(new Error('Không khởi động được bộ đọc Word. Hãy tải lại trang và thử lại.'));
    }
  });
}

export async function importChapterFile(file, { signal } = {}) {
  if (!file || !/\.(txt|docx)$/i.test(file.name || '')) {
    throw new Error('Chỉ hỗ trợ file .txt hoặc .docx. Với file .doc, hãy lưu lại thành .docx trong Word.');
  }
  if (file.size > MAX_CHAPTER_FILE_BYTES) throw new Error('File quá lớn (tối đa 20 MB). Hãy chia thành các file nhỏ hơn.');
  const docx = /\.docx$/i.test(file.name);
  let parts, skippedEmpty = 0, imagesSkipped = 0;
  if (docx) {
    const arrayBuffer = await readFile(file, true, signal);
    const result = await convertDocx(arrayBuffer, signal);
    ({ parts, skippedEmpty } = await splitChaptersHtml(result.html, { signal }));
    imagesSkipped = result.imagesSkipped || 0;
  } else {
    parts = splitChaptersTxt(await readFile(file, false, signal));
  }
  if (signal && signal.aborted) throw abortImport();
  if (!parts.length) throw new Error('Không tìm thấy nội dung văn bản để nhập chương từ file này.');
  const contentBytes = jsonBytes(parts);
  if (contentBytes > MAX_BOOK_BYTES) throw new Error('Nội dung chương sau tối ưu vượt 24 MB. Hãy chia thành nhiều bộ; không thể lưu cả bộ vượt giới hạn này.');
  return { file: file.name, parts, mode: 'append', docx, inputBytes: file.size, contentBytes, imagesSkipped, skippedEmpty };
}
