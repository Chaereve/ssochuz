import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';

export function createRichTextEditor({ element, content = '', onUpdate, onImageFile } = {}) {
  if (!element) throw new Error('Thiếu vùng gắn editor');
  let instance = null;
  const editor = new Editor({
    element,
    content: content || '<p></p>',
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
      Image.configure({ inline: false, allowBase64: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    editorProps: {
      attributes: {
        class: 'rte v2tiptap-prose',
        spellcheck: 'false',
        'aria-label': 'Nội dung chương',
      },
      transformPastedHTML(html) {
        return String(html || '')
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/\sclass="Mso[^\"]*"/gi, '')
          .replace(/\sstyle="[^\"]*mso-[^\"]*"/gi, '');
      },
      handlePaste(view, event) {
        if (!onImageFile || !event.clipboardData) return false;
        const files = Array.from(event.clipboardData.files || []).filter((file) => /^image\//i.test(file.type || ''));
        if (!files.length) return false;
        event.preventDefault();
        files.forEach((file) => onImageFile(file).then((url) => {
          if (url && instance) instance.chain().focus().setImage({ src: url }).run();
        }).catch((e) => { if (window.CZ && window.CZ.toast) window.CZ.toast('Upload ảnh lỗi: ' + (e.message || e), 'err'); }));
        return true;
      },
      handleDrop(view, event) {
        if (!onImageFile || !event.dataTransfer) return false;
        const files = Array.from(event.dataTransfer.files || []).filter((file) => /^image\//i.test(file.type || ''));
        if (!files.length) return false;
        event.preventDefault();
        files.forEach((file) => onImageFile(file).then((url) => {
          if (url && instance) instance.chain().focus().setImage({ src: url }).run();
        }).catch((e) => { if (window.CZ && window.CZ.toast) window.CZ.toast('Upload ảnh lỗi: ' + (e.message || e), 'err'); }));
        return true;
      },
    },
    onUpdate({ editor: ed }) {
      if (onUpdate) onUpdate(ed.getHTML());
    },
  });
  instance = editor;
  return editor;
}

export function htmlStats(html) {
  const text = String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
  const words = text ? text.split(/\s+/).length : 0;
  return { text, words, chars: text.length };
}

export function fileToChapterHtml(text, name = '') {
  const raw = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return '';
  if (/\.html?$/i.test(name) || /<\/?(p|div|br|h\d|img|blockquote|ul|ol|li)\b/i.test(raw)) return raw;
  return raw.split(/\n{2,}/).map((part) => '<p>' + part.trim().replace(/\n/g, ' ').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>').join('\n');
}
