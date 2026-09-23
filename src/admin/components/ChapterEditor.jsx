import { h } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { createRichTextEditor, fileToChapterHtml, htmlStats, splitChaptersTxt } from '../utils/richTextEditor.js';
import { readTime } from '../utils/format.js';
import { tempMediaInHtml } from '../utils/htmlSafety.js';
import { suggestChapterTitle, chapterKind } from '../../shared/chapters.js';

function clone(value) { return JSON.parse(JSON.stringify(value || {})); }
function quickWords(html) {
  const text = String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
  return text ? text.split(/\s+/).length : 0;
}
function draftKey(slug, index) { return 'ssochuz_admin_v2_chdraft:' + slug + ':' + index; }
function readDraft(slug, index) {
  try { return JSON.parse(localStorage.getItem(draftKey(slug, index)) || 'null'); } catch (e) { return null; }
}
function writeDraft(slug, index, data) {
  try { localStorage.setItem(draftKey(slug, index), JSON.stringify(Object.assign({ at: Date.now() }, data))); } catch (e) {}
}
function dropDraft(slug, index) {
  try { localStorage.removeItem(draftKey(slug, index)); } catch (e) {}
}
function toast(message, kind) {
  if (window.CZ && window.CZ.toast) window.CZ.toast(message, kind);
  else console[kind === 'err' ? 'error' : 'log'](message);
}
function apiRoot(apiBase) { return String(apiBase || (window.CZ && window.CZ.API) || '').replace(/\/+$/, ''); }
function htmlForEditor(html, apiBase) {
  const base = apiRoot(apiBase);
  if (!base) return String(html || '');
  return String(html || '').replace(/src=(['"])\/api\/img\//gi, 'src=$1' + base + '/api/img/');
}
function htmlForStorage(html, apiBase) {
  const base = apiRoot(apiBase);
  let out = String(html || '');
  if (base) out = out.split(base + '/api/img/').join('/api/img/');
  return out;
}
function fmtTime(ts) {
  try { return new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch (e) { return ''; }
}

function Toolbar({ editor }) {
  const ready = !!editor;
  const cmd = (fn) => () => editor && fn(editor.chain().focus()).run();
  const promptLink = () => {
    if (!editor) return;
    const old = editor.getAttributes('link').href || '';
    const url = window.prompt('Dán liên kết (để trống để bỏ link):', old);
    if (url == null) return; /* Cancel trả null; jsdom không cài prompt trả undefined */
    if (!url.trim()) editor.chain().focus().unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };
  const promptImage = () => {
    if (!editor) return;
    const src = window.prompt('Dán URL ảnh đã upload (/api/img/… hoặc https://):', '');
    if (!src) return;
    const t = src.trim();
    if (/^(blob:|data:)/i.test(t)) { toast('Không chèn blob/data URL. Hãy upload qua Worker.', 'err'); return; }
    if (/^https?:\/\//i.test(t) || /^\/api\/img\//i.test(t)) editor.chain().focus().setImage({ src: t }).run();
  };
  return (
    <div class="rte-tools v2tipbar" role="toolbar" aria-label="Định dạng chương">
      <button type="button" disabled={!ready} title="Đậm · Ctrl/Cmd+B" onClick={cmd((c) => c.toggleBold())}><b>B</b></button>
      <button type="button" disabled={!ready} title="Nghiêng · Ctrl/Cmd+I" onClick={cmd((c) => c.toggleItalic())}><i>I</i></button>
      <button type="button" disabled={!ready} title="Gạch chân · Ctrl/Cmd+U" onClick={cmd((c) => c.toggleUnderline())}><u>U</u></button>
      <span class="v2sep" aria-hidden="true"></span>
      <button type="button" disabled={!ready} title="Tiêu đề 2" onClick={cmd((c) => c.toggleHeading({ level: 2 }))}>H2</button>
      <button type="button" disabled={!ready} title="Tiêu đề 3" onClick={cmd((c) => c.toggleHeading({ level: 3 }))}>H3</button>
      <button type="button" disabled={!ready} title="Trích dẫn" onClick={cmd((c) => c.toggleBlockquote())}>❝</button>
      <button type="button" disabled={!ready} title="Đường ngang" onClick={cmd((c) => c.setHorizontalRule())}>━━</button>
      <span class="v2sep" aria-hidden="true"></span>
      <button type="button" disabled={!ready} title="Danh sách" onClick={cmd((c) => c.toggleBulletList())}>• list</button>
      <button type="button" disabled={!ready} title="Danh sách số" onClick={cmd((c) => c.toggleOrderedList())}>1. list</button>
      <button type="button" disabled={!ready} title="Căn trái" onClick={cmd((c) => c.setTextAlign('left'))}>↤</button>
      <button type="button" disabled={!ready} title="Căn giữa" onClick={cmd((c) => c.setTextAlign('center'))}>↔</button>
      <span class="v2sep" aria-hidden="true"></span>
      <button type="button" disabled={!ready} title="Liên kết" onClick={promptLink}>link</button>
      <button type="button" disabled={!ready} title="Ảnh URL bền" onClick={promptImage}>ảnh</button>
      <button type="button" disabled={!ready} title="Hoàn tác · Ctrl/Cmd+Z" onClick={cmd((c) => c.undo())}>↶</button>
      <button type="button" disabled={!ready} title="Làm lại · Ctrl/Cmd+Shift+Z" onClick={cmd((c) => c.redo())}>↷</button>
    </div>
  );
}

export function ChapterEditor({ slug, book, loading, apiBase, onLoad, onSaveBook, onUploadImage, writeBlocked = false, online = false }) {
  const [localBook, setLocalBook] = useState(book || null);
  const [index, setIndex] = useState(0);
  const [title, setTitle] = useState('');
  const [html, setHtml] = useState('');
  const [editor, setEditor] = useState(null);
  const [host, setHost] = useState(null);
  const [preview, setPreview] = useState(false);
  const [draft, setDraft] = useState(null);
  const [draftPhase, setDraftPhase] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragFrom, setDragFrom] = useState(-1);
  const [importPreview, setImportPreview] = useState(null);
  const fileRef = useRef(null);
  const multiRef = useRef(null);
  const imageRef = useRef(null);
  const initRef = useRef({ title: '', html: '' });

  useEffect(() => { setLocalBook(book || null); setIndex(0); }, [book && book.slug, slug]);
  const chapters = (localBook && Array.isArray(localBook.chapters) ? localBook.chapters : []);
  const current = chapters[index] || { t: '', html: '' };

  useEffect(() => {
    const baseTitle = current.t || ('Chương ' + (index + 1));
    const baseHtml = htmlForEditor(current.html || '<p></p>', apiBase);
    initRef.current = { title: baseTitle, html: baseHtml };
    setTitle(baseTitle);
    setHtml(baseHtml);
    setDraft(localBook ? readDraft(localBook.slug || slug, index) : null);
    setDraftPhase('');
  }, [localBook && localBook.slug, index, apiBase]);

  useEffect(() => {
    if (!host) return;
    const ed = createRichTextEditor({ element: host, content: initRef.current.html || '<p></p>', onUpdate: setHtml, onImageFile: uploadImageFile });
    setEditor(ed);
    return () => { try { ed.destroy(); } catch (e) {} setEditor(null); };
  }, [host, localBook && localBook.slug, index]);

  useEffect(() => {
    if (!editor) return;
    const cur = editor.getHTML();
    if (html !== cur) editor.commands.setContent(html || '<p></p>', false);
  }, [editor]);

  useEffect(() => {
    if (!localBook || !chapters.length) return;
    const init = initRef.current;
    if (title === init.title && html === init.html) return;
    setDraftPhase('saving');
    const t = setTimeout(() => {
      writeDraft(localBook.slug || slug, index, { title, html });
      setDraft(readDraft(localBook.slug || slug, index));
      setDraftPhase('saved');
    }, 900);
    return () => clearTimeout(t);
  }, [title, html, localBook && localBook.slug, index]);

  const stat = useMemo(() => htmlStats(html), [html]);
  const temps = useMemo(() => tempMediaInHtml(htmlForStorage(html || '', apiBase)), [html, apiBase]);
  const dirty = title !== initRef.current.title || html !== initRef.current.html;

  const saveChapter = async () => {
    if (!localBook) return;
    if (temps.length) {
      toast('Chưa upload hết ảnh tạm (blob/data). Không ghi KV.', 'err');
      return;
    }
    if (writeBlocked) {
      toast('Quota KV hôm nay đã hết — giữ nháp cục bộ, không gọi API ghi.', 'err');
      return;
    }
    const next = clone(localBook);
    next.chapters = Array.isArray(next.chapters) ? next.chapters : [];
    if (!next.chapters[index]) next.chapters[index] = { t: title || ('Chương ' + (index + 1)), html: '' };
    next.chapters[index] = Object.assign({}, next.chapters[index], { t: title || ('Chương ' + (index + 1)), html: htmlForStorage(html || '', apiBase), status: next.chapters[index].status || 'published' });
    try {
      await onSaveBook(next);
      setLocalBook(next);
      dropDraft(next.slug || slug, index);
      setDraft(null);
      initRef.current = { title, html };
      setDraftPhase('');
    } catch (e) { /* onSaveBook đã toast lỗi; giữ nháp để không mất chữ */ }
  };
  const addChapter = () => {
    const next = clone(localBook || { title: slug, slug, chapters: [] });
    next.chapters = Array.isArray(next.chapters) ? next.chapters : [];
    /* gợi ý số chương CHÍNH kế tiếp (bỏ qua Lờí mở đầu / giới thiệu ngưới vật /
       ngoại truyện) — trước đây cứ length+1 nên bộ có mở đầu bị gọi sai số */
    next.chapters.push({ t: suggestChapterTitle(next.chapters), html: '<p></p>', status: 'draft' });
    setLocalBook(next); setIndex(next.chapters.length - 1);
  };
  const deleteChapter = async () => {
    if (!localBook || !chapters[index]) return;
    if (!window.confirm('Xoá chương ' + (index + 1) + ' — ' + (chapters[index].t || '') + '?')) return;
    const typed = window.prompt('Gõ XOÁ để xác nhận xoá chương:', '');
    if (typed !== 'XOÁ') return;
    const next = clone(localBook);
    next.chapters.splice(index, 1);
    try {
      await onSaveBook(next);
      setLocalBook(next); setIndex(Math.max(0, Math.min(index - 1, next.chapters.length - 1)));
    } catch (e) { /* đã toast lỗi */ }
  };
  const moveChapter = async (delta) => {
    await reorderChapter(index, index + delta);
  };
  const reorderChapter = async (from, to) => {
    if (!localBook || from === to || from < 0 || to < 0 || to >= chapters.length) return;
    const next = clone(localBook);
    const [item] = next.chapters.splice(from, 1);
    next.chapters.splice(to, 0, item);
    try {
      await onSaveBook(next);
      setLocalBook(next); setIndex(to);
    } catch (e) { /* đã toast lỗi */ }
  };
  const restoreDraft = () => {
    if (!draft) return;
    const draftHtml = htmlForEditor(draft.html || html, apiBase);
    setTitle(draft.title || title);
    setHtml(draftHtml);
    if (editor) editor.commands.setContent(draftHtml || '<p></p>', false);
  };
  const importFile = (file) => {
    if (!file || !editor) return;
    const reader = new FileReader();
    reader.onload = () => {
      const imported = fileToChapterHtml(reader.result || '', file.name);
      editor.chain().focus().insertContent(imported).run();
      toast('Đã chèn vào editor. Bấm Lưu chương để ghi KV.', 'info');
    };
    reader.readAsText(file);
  };
  const importMultiTxt = (file) => {
    if (!file || !localBook) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parts = splitChaptersTxt(reader.result || '');
      if (!parts.length) { toast('Không tách được chương nào từ file này.', 'err'); return; }
      setImportPreview({ file: file.name, parts, mode: 'append' });
    };
    reader.readAsText(file);
  };
  const confirmImport = async () => {
    if (!importPreview || !localBook) return;
    const parts = importPreview.parts;
    const next = clone(localBook);
    next.chapters = Array.isArray(next.chapters) ? next.chapters : [];
    if (importPreview.mode === 'replace') {
      const ok = window.confirm('Thay thế TOÀN BỘ ' + next.chapters.length + ' chương hiện có bằng ' + parts.length + ' chương từ file?');
      if (!ok) return;
      next.chapters = parts;
    } else {
      next.chapters = next.chapters.concat(parts);
    }
    try {
      await onSaveBook(next);
      setLocalBook(next);
      setIndex(importPreview.mode === 'replace' ? 0 : Math.max(0, next.chapters.length - parts.length));
      toast('Đã nhập ' + parts.length + ' chương từ file.', 'ok');
      setImportPreview(null);
    } catch (e) { /* onSaveBook đã toast lỗi */ }
  };
  const uploadImageFile = async (file) => {
    if (!file) return '';
    if (!onUploadImage) throw new Error('Chưa nối chức năng upload ảnh.');
    setUploading(true);
    try {
      const url = await onUploadImage(file);
      return url;
    } finally {
      setUploading(false);
    }
  };
  const chooseImage = async (file) => {
    if (!file || !editor) return;
    try {
      const url = await uploadImageFile(file);
      if (url) editor.chain().focus().setImage({ src: url }).run();
    } catch (e) {
      window.CZ && window.CZ.toast ? window.CZ.toast('Upload ảnh lỗi: ' + (e.message || e), 'err') : alert(e.message || e);
    }
  };

  const statusLabel = { draft: 'Nháp', scheduled: 'Hẹn giờ', published: 'Xuất bản', hidden: 'Ẩn' };

  if (!localBook && !loading) {
    return <section class="card2"><div class="row"><h3>Chương</h3><span class="grow"></span><button class="btn ghost sm" type="button" onClick={() => onLoad && onLoad()}>Đọc dữ liệu chương</button></div><p class="hint">Chưa có dữ liệu chương trong cache.</p></section>;
  }
  return (
    <section class="card2 v2chapter-card">
      <div class="row"><h3>Chương</h3><span class="grow"></span><button class="btn ghost sm" type="button" onClick={addChapter}>Thêm chương</button><button class="btn ghost sm" type="button" disabled={!chapters.length} onClick={() => moveChapter(-1)}>Lên</button><button class="btn ghost sm" type="button" disabled={!chapters.length} onClick={() => moveChapter(1)}>Xuống</button></div>
      <p class="hint">Editor dùng TipTap; output vẫn là HTML lưu trong <code>chapters[].html</code>. Autosave chỉ localStorage — không ghi KV khi đang gõ.</p>
      {loading ? <div class="empty sm">Đang đọc chương…</div> : null}
      <div class="v2chapter-grid">
        <aside class="v2chapter-list">
          {chapters.length ? chapters.map((chapter, i) => {
            const kind = chapterKind(chapter.t || '');
            const kindTag = kind === 'open' ? 'Mở đầu' : (kind === 'extra' ? 'Ngoại truyện' : '');
            return (
              <button type="button" class={i === index ? 'on' : ''} key={i} draggable="true"
                onDragStart={() => setDragFrom(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); reorderChapter(dragFrom, i); setDragFrom(-1); }}
                onClick={() => setIndex(i)}>
                <b>{i + 1}</b><span>{chapter.t || ('Chương ' + (i + 1))}</span>
                <em>{kindTag ? kindTag + ' · ' : ''}{quickWords(chapter.html)} từ{chapter.status && chapter.status !== 'published' ? ' · ' + (statusLabel[chapter.status] || chapter.status) : ''}</em>
              </button>
            );
          }) : <div class="empty sm">Chưa có chương.</div>}
        </aside>
        <div class="v2chapter-editor">
          <label class="fl">Tên chương</label>
          <input class="inp" value={title} onInput={(e) => setTitle(e.currentTarget.value)} placeholder={'Chương ' + (index + 1)} />
          <label class="fl">Trạng thái chương
            <select class="inp" value={(chapters[index] && chapters[index].status) || 'published'} onChange={(e) => {
              if (!localBook) return;
              const next = clone(localBook);
              if (next.chapters[index]) next.chapters[index].status = e.target.value;
              setLocalBook(next);
            }}>
              <option value="draft">Nháp</option>
              <option value="scheduled">Hẹn giờ</option>
              <option value="published">Xuất bản</option>
              <option value="hidden">Ẩn</option>
            </select>
          </label>
          <Toolbar editor={editor} />
          <div class="v2tiphost" ref={setHost}></div>
          <p class="v2draft-status">
            {draftPhase === 'saving' ? <span>Đang lưu nháp cục bộ…</span> : null}
            {draftPhase === 'saved' && draft ? <span>Đã lưu nháp cục bộ lúc {fmtTime(draft.at)}</span> : null}
            {dirty ? <span> · <b>Chưa ghi vào Cloudflare KV</b></span> : null}
            {!online ? <span> · Nháp phiên (dữ liệu tĩnh)</span> : null}
          </p>
          {temps.length ? (
            <div class="msgbar show err">
              Còn ảnh tạm chưa upload: {temps.slice(0, 3).join(', ')}. Hãy bấm Upload ảnh / Thử lại — không ghi KV khi còn blob:/data:.
            </div>
          ) : null}
          {importPreview ? (
            <div class="v2import-preview">
              <b>Xem trước nhập file</b>
              <p class="hint">Phát hiện {importPreview.parts.length} chương từ “{importPreview.file}”. Chưa ghi KV.</p>
              <ul>{importPreview.parts.slice(0, 12).map((p, i) => <li key={i}>{p.t}</li>)}</ul>
              {importPreview.parts.length > 12 ? <p class="hint">… và {importPreview.parts.length - 12} chương nữa</p> : null}
              <label class="fl">Cách nhập
                <select class="inp" value={importPreview.mode} onChange={(e) => setImportPreview(Object.assign({}, importPreview, { mode: e.target.value }))}>
                  <option value="append">Nối vào cuối (append)</option>
                  <option value="replace">Thay thế toàn bộ chương</option>
                </select>
              </label>
              <div class="row">
                <button class="btn pri sm" type="button" disabled={writeBlocked} onClick={confirmImport}>Xác nhận nhập</button>
                <button class="btn ghost sm" type="button" onClick={() => setImportPreview(null)}>Huỷ</button>
              </div>
            </div>
          ) : null}
          <div class="row mt v2chap-actions">
            <span class="sm muted">{stat.words} từ · {stat.chars} ký tự · ~{readTime(stat.words)} phút đọc{draft ? ' · có nháp autosave' : ''}</span>
            <span class="grow"></span>
            <input ref={fileRef} class="hide" type="file" accept=".txt,.html,.htm,text/plain,text/html" onChange={(e) => importFile(e.currentTarget.files && e.currentTarget.files[0])} />
            <input ref={multiRef} class="hide" type="file" accept=".txt,text/plain" onChange={(e) => { importMultiTxt(e.currentTarget.files && e.currentTarget.files[0]); e.currentTarget.value = ''; }} />
            <input ref={imageRef} class="hide" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => chooseImage(e.currentTarget.files && e.currentTarget.files[0])} />
            <button class="btn ghost sm" type="button" onClick={() => fileRef.current && fileRef.current.click()}>Import .txt/.html</button>
            <button class="btn ghost sm" type="button" disabled={!localBook} title="1 file .txt nhiều chương — tách theo dòng “Chương X”, xem trước rồi mới ghi" onClick={() => multiRef.current && multiRef.current.click()}>Nhập nhiều chương</button>
            <button class="btn ghost sm" type="button" disabled={uploading} onClick={() => imageRef.current && imageRef.current.click()}>{uploading ? 'Đang nén ảnh…' : 'Upload ảnh'}</button>
            {draft ? <button class="btn ghost sm" type="button" onClick={restoreDraft}>Khôi phục nháp</button> : null}
            <button class="btn ghost sm" type="button" onClick={() => setPreview(!preview)}>{preview ? 'Ẩn preview' : 'Preview độc giả'}</button>
            <button class="btn pri sm" type="button" disabled={writeBlocked || !!temps.length} title={writeBlocked ? 'Quota KV hôm nay đã hết — nháp cục bộ vẫn được giữ' : (online ? 'Ghi chương vào Cloudflare KV (book + registry)' : 'Chỉ lưu nháp phiên — chưa ghi Cloudflare KV')} onClick={saveChapter}>{writeBlocked ? 'Hết quota KV' : (online ? 'Lưu chương' : 'Lưu nháp phiên')}</button>
          </div>
          <div class="v2chap-danger">
            <span class="sm">Xoá chương đang chọn khỏi bộ — cần gõ XOÁ để xác nhận, không khôi phục được.</span>
            <span class="grow"></span>
            <button class="btn ghost sm danger" type="button" disabled={writeBlocked || !chapters.length} onClick={deleteChapter}>Xoá chương</button>
          </div>
          {preview ? <div class="v2reader-preview"><div class="reading"><h2>{title}</h2><div class="rte" dangerouslySetInnerHTML={{ __html: html }} /></div></div> : null}
        </div>
      </div>
    </section>
  );
}
