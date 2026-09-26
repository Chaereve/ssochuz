/* Chạy riêng trong Web Worker: giải nén/đọc Word không khoá giao diện admin.
   Không đọc ảnh thành base64, không gửi file/URL trong tài liệu ra mạng. */
import { convertToHtml } from 'mammoth';
import { checkDocxArchive } from './utils/docxArchive.js';

self.onmessage = async (event) => {
  try {
    checkDocxArchive(event.data);
    let imagesSkipped = 0;
    const result = await convertToHtml({ arrayBuffer: event.data }, {
      includeEmbeddedStyleMap: false,
      externalFileAccess: false,
      styleMap: ["r[style-name='Emphasis'] => em", "r[style-name='Strong'] => strong", 'u => u'],
      convertImage: () => { imagesSkipped++; return []; },
    });
    // Chặn trước khi copy HTML quá lớn về UI. Chặn JSON theo byte ở bước xác nhận nữa.
    if (result.value.length > 24 * 1024 * 1024) {
      throw new Error('Nội dung sau chuyển đổi quá lớn (trên 24 MB). Hãy chia file thành nhiều phần.');
    }
    self.postMessage({ html: result.value, imagesSkipped });
  } catch (error) {
    self.postMessage({ error: /Nội dung (sau chuyển đổi|giải nén)/.test(error.message || '') ? error.message :
      'Không đọc được file DOCX. File có thể bị hỏng hoặc được bảo vệ bằng mật khẩu. Hãy mở trong Word và lưu lại thành .docx.' });
  }
};
