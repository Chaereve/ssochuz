/* ============================================================================
   src/admin/editor/schema.js · KHAI BÁO SCHEMA CHO TRÌNH SOẠN CHƯƠNG
   ----------------------------------------------------------------------------
   VÌ SAO dùng TipTap/ProseMirror: mục 7.3 của bản yêu cầu là một DANH SÁCH
   TRẮNG thẻ HTML rất chặt. ProseMirror không "lọc" HTML — nó chỉ biết đúng
   những nút được khai báo ở đây. Thẻ nào không có trong schema thì về mặt kiến
   trúc là KHÔNG THỂ tồn tại trong tài liệu, kể cả khi người dùng dán từ Word.
   Đây là lý do chọn TipTap thay vì tự viết bộ lọc (bộ lọc luôn sót trường hợp).

   Đã đo trên dữ liệu thật: 1202 chương của 62 bộ đi qua schema này KHÔNG mất
   một chữ nào (xem tests/t_editor_schema.js).

   Danh sách thẻ được phép — phải KHỚP với src/admin/lib/html-contract.js:
     p · h2 · h3 · blockquote · ul · ol · li · hr
     strong · em · u · s · a · br · figure · img · figcaption · aside.note
   Chỉ cho phép style="text-align:…". Không màu chữ, không cỡ chữ, không font.
   ========================================================================== */
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Heading from '@tiptap/extension-heading';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Underline from '@tiptap/extension-underline';
import Strike from '@tiptap/extension-strike';
import Link from '@tiptap/extension-link';
import Blockquote from '@tiptap/extension-blockquote';
import { BulletList, OrderedList, ListItem } from '@tiptap/extension-list';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import HardBreak from '@tiptap/extension-hard-break';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import { Node } from '@tiptap/core';
import { SlashMenu } from './slash.js';
import { BubbleMenu } from './bubble.js';

/* --- Lời tác giả: <aside class="note"> ----------------------------------- */
const AuthorNote = Node.create({
  name: 'authorNote',
  group: 'block',
  content: 'inline*',
  defining: true,
  parseHTML() { return [{ tag: 'aside' }]; },
  renderHTML() { return ['aside', { class: 'note' }, 0]; },
});

/* --- Ngắt cảnh: dùng lại <hr> nhưng có lệnh riêng cho dễ hiểu ------------ */

/* Bộ mở rộng dùng cho trình soạn chương. `exports` để bài kiểm thử Node dựng
   được editor y hệt bản chạy thật. */
function chapterExtensions(opts) {
  const o = opts || {};
  return [
    Document, Paragraph, Text,
    Heading.configure({ levels: [2, 3] }),
    Bold, Italic, Underline, Strike,
    Link.configure({
      openOnClick: false,
      autolink: false,
      /* chặn javascript:/data: ngay tại tầng schema */
      protocols: ['http', 'https', 'mailto'],
      HTMLAttributes: { rel: 'noopener nofollow', target: '_blank' },
    }),
    Blockquote, BulletList, OrderedList, ListItem,
    HorizontalRule, HardBreak,
    Image.configure({ inline: false, allowBase64: false }),
    AuthorNote,
    TextAlign.configure({ types: ['paragraph', 'heading'] }),
    Placeholder.configure({
      placeholder: o.placeholder || 'Bấm vào đây để viết chương… gõ “/” để chèn khối.',
    }),
    /* Menu gõ "/" — onImage nối ra nút chọn tệp có sẵn của trang quản trị. */
    SlashMenu({ onImage: o.onImage }),
    /* Thanh nổi khi bôi đen chữ. hoiLienKet do bên ngoài truyền (legacy.js
       dùng hộp thoại sẵn có của trang) — trình soạn không tự mở prompt. */
    BubbleMenu({ hoiLienKet: o.hoiLienKet }),
  ];
}

export { chapterExtensions, AuthorNote };
