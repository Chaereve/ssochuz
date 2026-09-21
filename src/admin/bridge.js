/* ============================================================================
   src/admin/bridge.js · CẦU NỐI giữa mã quản trị cũ và trình soạn mới
   ----------------------------------------------------------------------------
   VÌ SAO tách thành tệp riêng (chứ không để trong main.js): `legacy.js` là một
   IIFE — nạp vào là chạy ngay. Lệnh `import` tĩnh luôn được kéo lên chạy TRƯỚC
   mọi câu lệnh trong tệp, nên nếu main.js viết:

       window.CZEditor = {...};      // câu lệnh
       import './legacy.js';         // bị kéo lên trên, chạy TRƯỚC

   thì legacy.js sẽ chạy khi window.CZEditor còn chưa tồn tại (đã thử: nhận
   được `undefined`) và trang âm thầm rơi về contenteditable cũ.

   Cách chắc chắn: đặt phần dựng cầu nối vào MỘT MODULE RIÊNG rồi import module
   đó TRƯỚC legacy.js. Thứ tự giữa các import tĩnh thì được bảo đảm, nên cầu
   nối luôn sẵn sàng đúng lúc. (Không dùng top-level await vì bản phát hành
   nhắm es2019.)
   ========================================================================== */
import { normalizeChapterHtml } from './lib/html-contract.js';
import { isPublic, countWords, readingMinutes, chapterState } from './lib/chapter.js';
import * as ED from './editor/index.js';
import * as AS from './editor/autosave.js';

const w = typeof window !== 'undefined' ? window : null;

if (w) {
  let mounted = false;

  w.CZEditor = {
    ready() { return mounted && !!ED.getEditor(); },

    /* legacy.js gọi khi phần tử #edBody đã có trong DOM. */
    mount(el, onChange, opts) {
      if (mounted) return true;
      if (!el) return false;
      try {
        ED.setOnChange(onChange);
        /* opts.onImage: menu "/" chọn "Chèn ảnh" thì gọi ngược ra trang quản
           trị để mở hộp chọn tệp (input#edImg) — trình soạn không tự mở được. */
        ED.mountEditor(el, opts || {});
        mounted = !!ED.getEditor();
      } catch (e) {
        /* Trình soạn hỏng thì KHÔNG được làm chết cả trang quản trị:
           trả false để mọi chỗ gọi tự dùng lại contenteditable. */
        mounted = false;
        if (w.console && w.console.warn) w.console.warn('Không gắn được trình soạn mới:', e && e.message);
      }
      return mounted;
    },

    setHtml(html, api) { ED.setChapterHtml(html, api); },
    getHtml(api) { return ED.getChapterHtml(api); },
    stats(api) { return ED.stats(api); },
    image(url, alt, api) { ED.insertImage(url, alt, api); },
    block(tag) { ED.setBlock(tag); },
    align(dir) { ED.setAlign(dir); },
    link(href) { ED.setLink(href); },
    focus() { ED.focus(); },
    clear() { ED.clear(); },
    append(html, api) { ED.appendHtml(html, api); },

    /* Trả true nếu đã xử lý xong; false để legacy.js dùng execCommand như cũ. */
    cmd(name, val) {
      if (name === 'justifyLeft') { ED.setAlign('left'); return true; }
      if (name === 'justifyCenter') { ED.setAlign('center'); return true; }
      if (name === 'justifyRight') { ED.setAlign('right'); return true; }
      if (name === 'justifyFull') { ED.setAlign('justify'); return true; }
      if (name === 'createLink') { ED.setLink(val); return true; }
      const fn = ED.commands[name];
      if (typeof fn === 'function') { fn(); return true; }
      return false;
    },
  };

  /* Tự lưu chương đang viết vào máy (IndexedDB). Xem editor/autosave.js. */
  w.CZAutosave = {
    luu: AS.luu, doc: AS.doc, xoa: AS.xoa, tatCa: AS.tatCa, don: AS.don,
    taoBoLuu: AS.taoBoLuu,
  };

  /* Hàm thuần dùng chung cho các khu vực mới và cho bài kiểm thử. */
  w.CZAdmin = Object.assign(w.CZAdmin || {}, {
    normalizeChapterHtml, isPublic, chapterState, countWords, readingMinutes,
  });
}
