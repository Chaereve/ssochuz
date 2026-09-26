import { isChapterHeading, suggestChapterTitle } from '../../shared/chapters.js';

const BLOCKS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'li', 'ul', 'ol', 'table', 'tr', 'td', 'th']);
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template', 'img', 'video', 'audio', 'input', 'button']);
const MARKS = { b: 'strong', strong: 'strong', i: 'em', em: 'em', u: 'u', s: 's', strike: 's', del: 's', sub: 'sub', sup: 'sup' };
const ORDER = ['strong', 'em', 'u', 's', 'sub', 'sup'];
const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function abortImport() { return new DOMException('Đã huỷ đọc file.', 'AbortError'); }

/* Không chèn HTML của Mammoth vào DOM đang hiển thị: template là inert.
   Chỉ tự dựng <p>, <br> và các mark cho phép từ TEXT đã escape. Không thuộc
   tính/link/style/id/base64 nào lọt vào kết quả. Gộp run cùng định dạng để
   Word chia một câu thành hàng trăm run cũng không sinh HTML dư thừa.
   Bảng/danh sách được đọc theo thứ tự thành đoạn văn, không sao chép layout Word. */
export async function splitChaptersHtml(html, { signal } = {}) {
  const root = document.createElement('template');
  root.innerHTML = html;
  const out = [];
  let current = null, runs = [], paragraph = [], paragraphHasText = false;
  let skippedEmpty = 0, visited = 0;
  function flushChapter() {
    if (!current) return;
    if (current.body.length) out.push({ t: current.t || suggestChapterTitle(out), html: current.body.join('') });
    else if (current.t) skippedEmpty++;
    current = null;
  }
  function flushParagraph() {
    if (paragraphHasText) {
      if (!current) current = { t: '', body: [] };
      current.body.push('<p>' + paragraph.join('<br>') + '</p>');
    }
    paragraph = []; paragraphHasText = false;
  }
  function flushLine() {
    const text = runs.map((r) => r.text.join('')).join('');
    if (isChapterHeading(text)) {
      flushParagraph(); flushChapter();
      current = { t: text.trim().replace(/^#{1,3}\s*/, ''), body: [] };
    } else {
      paragraph.push(runs.map((r) => {
        const content = escape(r.text.join(''));
        return r.marks.map((m) => '<' + m + '>').join('') + content + r.marks.slice().reverse().map((m) => '</' + m + '>').join('');
      }).join(''));
      if (text.trim()) paragraphHasText = true;
    }
    runs = [];
  }
  function boundary() { if (runs.length) flushLine(); flushParagraph(); }
  // Duyệt bằng stack, không tràn call stack khi các span Word lồng sâu.
  const stack = [{ node: root.content, marks: [] }];
  while (stack.length) {
    if (signal && signal.aborted) throw abortImport();
    if (++visited % 512 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    const item = stack.pop();
    if (item.end) { boundary(); continue; }
    const { node, marks } = item;
    if (node.nodeType === 3) {
      if (!node.nodeValue) continue;
      const key = marks.join(',');
      const last = runs[runs.length - 1];
      if (last && last.key === key) last.text.push(node.nodeValue);
      else runs.push({ key, marks, text: [node.nodeValue] });
      continue;
    }
    if (node.nodeType !== 1 && node.nodeType !== 11) continue;
    const tag = (node.localName || '').toLowerCase();
    if (DROP.has(tag)) continue;
    if (tag === 'br') { flushLine(); continue; }
    const block = BLOCKS.has(tag);
    if (block) { boundary(); stack.push({ end: true }); }
    const mark = MARKS[tag];
    const nextMarks = mark && !marks.includes(mark) ? ORDER.filter((m) => m === mark || marks.includes(m)) : marks;
    for (let child = node.lastChild; child; child = child.previousSibling) stack.push({ node: child, marks: nextMarks });
  }
  if (signal && signal.aborted) throw abortImport();
  boundary(); flushChapter();
  return { parts: out, skippedEmpty };
}
