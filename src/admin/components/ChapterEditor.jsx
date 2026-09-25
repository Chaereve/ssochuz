import { h } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { createRichTextEditor, fileToChapterHtml, htmlStats, splitChaptersTxt } from '../utils/richTextEditor.js';
import { readTime } from '../utils/format.js';
import { tempMediaInHtml } from '../utils/htmlSafety.js';
import { suggestChapterTitle, chapterKind } from '../../shared/chapters.js';
import { CHAPTER_STATUSES, chapterStatusOf, chapterAtMs, isChapterPending, isoToLocalInput, localInputToIso, scheduleLabelOf, scheduleWarning, hoursUntil } from '../../shared/schedule.js';

function clone(value) { return JSON.parse(JSON.stringify(value || {})); }
function quickWords(html) {
  const text = String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
  return text ? text.split(/\s+/).length : 0;
}
/* Nháp cục bộ: khoá theo từng chương để mở lại đúng chương là thấy đúng nháp */
function draftKey(slug, index) { return 'ssochuz_admin_v2_chdraft:' + slug + ':' + index; }
function readDraft(slug, index) {
  try { return JSON.parse(localStorage.getItem(draftKey(slug, index)) || 'null'); } catch (e) { return null; }
}
function writeDraft(slug, index, data) {
  const rec = Object.assign({ at: Date.now() }, data);
  try { localStorage.setItem(draftKey(slug, index), JSON.stringify(rec)); } catch (e) {}
  return rec;
}
function dropDraft(slug, index) {
  try { localStorage.removeItem(draftKey(slug, index)); } catch (e) {}
}
/* Quét nháp có sẵn của cả bộ MỘT lần (đọc localStorage trong lúc render cho
   từng chương sẽ chậm dần khi bộ dài). */
function scanDrafts(slug) {
  const out = {};
  try {
    const pre = 'ssochuz_admin_v2_chdraft:' + slug + ':';
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || k.indexOf(pre) !== 0) continue;
      const idx = Number(k.slice(pre.length));
      const rec = JSON.parse(localStorage.getItem(k) || 'null');
      if (rec && Number.isFinite(idx)) out[idx] = rec;
    }
  } catch (e) {}
  return out;
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
function fmtMs(ms) {
  const n = Math.max(0, Number(ms) || 0);
  return n >= 1000 ? (n / 1000).toFixed(1).replace('.', ',') + ' giây' : Math.round(n) + ' ms';
}
function localInputPlus(hours) {
  const d = new Date(Date.now() + hours * 3600000);
  return isoToLocalInput(d.toISOString());
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

export function ChapterEditor({ slug, book, loading, apiBase, onLoad, onSaveBook, onSaveChapter, onDeleteChapter, onMoveChapter, onUploadImage, writeBlocked = false, online = false, shortcuts }) {
  const [localBook, setLocalBook] = useState(book || null);
  const [index, setIndex] = useState(0);
  const [title, setTitle] = useState('');
  const [html, setHtml] = useState('');
  const [status, setStatus] = useState('published');
  const [atLocal, setAtLocal] = useState('');
  const [editor, setEditor] = useState(null);
  const [host, setHost] = useState(null);
  const [preview, setPreview] = useState(false);
  const [draft, setDraft] = useState(null);
  const [draftMap, setDraftMap] = useState({});
  const [draftPhase, setDraftPhase] = useState('');
  /* Tăng lên khi dữ liệu chương đổi mà vị trí đang mở không đổi (nhập file
     thay thế toàn bộ) — effect nạp chương theo dõi số này để vẽ lại đúng bản. */
  const [reloadTick, setReloadTick] = useState(0);
  const [restored, setRestored] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMs, setSavedMs] = useState(0);
  const [dragFrom, setDragFrom] = useState(-1);
  const [importPreview, setImportPreview] = useState(null);
  const fileRef = useRef(null);
  const multiRef = useRef(null);
  const imageRef = useRef(null);
  const cardRef = useRef(null);
  /* Bản đang có trên Worker của chương mở hiện tại (đối chiếu để biết “chưa lưu”) */
  const baseRef = useRef({ title: '', html: '', status: 'published', atLocal: '' });
  /* Dữ liệu đang gõ, cập nhật NGAY trong lúc render — nhờ vậy hàm làm sạch
     (đổi chương / đóng tab) luôn đọc được bản mới nhất, không bị “quên” chữ */
  const liveRef = useRef(null);
  /* Chương đã nạp xong (khoá slug#index) — chỉ ghi nháp khi dữ liệu đang gõ
     thuộc đúng chương này, tránh ghi nhầm nội dung chương cũ sang chương mới */
  const bootRef = useRef('');

  useEffect(() => { setLocalBook(book || null); setIndex(0); }, [book && book.slug, slug]);
  const chapters = (localBook && Array.isArray(localBook.chapters) ? localBook.chapters : []);
  const current = chapters[index] || { t: '', html: '' };
  const key = (localBook ? (localBook.slug || slug) : slug) + '#' + index;
  liveRef.current = localBook ? { key, slug: localBook.slug || slug, index, title, html, status, atLocal } : null;

  /* Cập nhật NGAY giá trị đang gõ vào liveRef. Vì sao cần: liveRef được gán lại
     mỗi lần render, mà render của Preact lại xếp hàng sau sự kiện — gõ chữ rồi
     bấm đổi chương trong cùng một nhịp (dán ảnh/xong bấm ngay) thì bản render
     chưa kịp có chữ mới, flushDraft sẽ đọc phải giá trị cũ và ghi nháp thiếu
     chữ. Gọi patchLive trong chính handler là chỗ duy nhất không bị nhịp đó. */
  function patchLive(patch) {
    if (liveRef.current) Object.assign(liveRef.current, patch);
  }
  function noteDraft(i, rec) { setDraftMap((m) => Object.assign({}, m, { [i]: rec })); }
  function clearDraftNote(i) {
    setDraftMap((m) => { const n = Object.assign({}, m); delete n[i]; return n; });
  }
  /* Ghi nháp ngay (không debounce) — dùng khi đổi chương/đóng tab. */
  function flushDraft() {
    const live = liveRef.current;
    if (!live || live.key !== bootRef.current) return false;
    const base = baseRef.current;
    const dirty = live.title !== base.title || live.html !== base.html || live.status !== base.status || live.atLocal !== base.atLocal;
    if (!dirty) { dropDraft(live.slug, live.index); clearDraftNote(live.index); setDraft(null); return false; }
    const rec = writeDraft(live.slug, live.index, { title: live.title, html: live.html, status: live.status, atLocal: live.atLocal });
    setDraft(rec);
    noteDraft(live.index, rec);
    return true;
  }
  /* Đổi chương: LƯU NHÁP TRƯỚC rồi mới nhảy — đây đúng là chỗ trước đây làm mất
     chữ đang gõ dở (đổi chương là state bị thay, nháp debounce 900ms chưa kịp ghi). */
  function gotoIndex(next) {
    const n = Math.max(0, Math.min(chapters.length - 1, next));
    if (n === index) return;
    flushDraft();
    setRestored(false);
    setIndex(n);
  }

  useEffect(() => {
    const baseTitle = current.t || ('Chương ' + (index + 1));
    const baseHtml = htmlForEditor(current.html || '<p></p>', apiBase);
    const baseStatus = chapterStatusOf(current) || 'published';
    const baseAtLocal = isoToLocalInput(chapterAtMs(current) || '');
    baseRef.current = { title: baseTitle, html: baseHtml, status: baseStatus, atLocal: baseAtLocal };
    bootRef.current = key;
    setTitle(baseTitle);
    setHtml(baseHtml);
    setStatus(baseStatus);
    setAtLocal(baseAtLocal);
    /* Nháp có sẵn của chương này thì khôi phục LUÔN (trước đây phải bấm nút
       “Khôi phục nháp” mới thấy, nên rất dễ tưởng là mất chữ) */
    setDraftMap(scanDrafts(localBook ? (localBook.slug || slug) : slug));
    const saved = localBook ? readDraft(localBook.slug || slug, index) : null;
    const different = saved && (saved.title !== baseTitle || saved.html !== baseHtml
      || (saved.status || 'published') !== baseStatus || (saved.atLocal || '') !== baseAtLocal);
    if (different) {
      const t2 = saved.title == null ? baseTitle : saved.title;
      const h2 = saved.html == null ? baseHtml : saved.html;
      const s2 = saved.status || baseStatus;
      const a2 = saved.atLocal || '';
      patchLive({ title: t2, html: h2, status: s2, atLocal: a2 });
      setTitle(t2);
      setHtml(h2);
      setStatus(s2);
      setAtLocal(a2);
      setDraft(saved);
      setRestored(true);
      setDraftPhase('');
    } else {
      if (saved) dropDraft(localBook.slug || slug, index);
      setDraft(null);
      setRestored(false);
      setDraftPhase('');
    }
  }, [localBook && localBook.slug, index, apiBase, reloadTick]);

  useEffect(() => {
    if (!host) return;
    const ed = createRichTextEditor({
      element: host,
      content: baseRef.current.html || '<p></p>',
      onUpdate: (content) => { patchLive({ html: content }); setHtml(content); },
      onImageFile: uploadImageFile,
    });
    setEditor(ed);
    return () => { try { ed.destroy(); } catch (e) {} setEditor(null); };
  }, [host, localBook && localBook.slug, index]);

  useEffect(() => {
    if (!editor) return;
    const cur = editor.getHTML();
    if (html !== cur) editor.commands.setContent(html || '<p></p>', false);
  }, [editor]);

  /* Autosave nháp cục bộ: 700ms sau khi ngừng gõ. Trước đây 900ms nhưng đổi
     chương ngay sau khi gõ là mất; giờ đổi chương luôn gọi flushDraft() trước. */
  useEffect(() => {
    if (!localBook || !chapters.length) return;
    const base = baseRef.current;
    if (title === base.title && html === base.html && status === base.status && atLocal === base.atLocal) {
      setDraftPhase('');
      return;
    }
    setDraftPhase('saving');
    const t = setTimeout(() => {
      const rec = writeDraft(localBook.slug || slug, index, { title, html, status, atLocal });
      setDraft(rec);
      noteDraft(index, rec);
      setDraftPhase('saved');
    }, 700);
    return () => clearTimeout(t);
  }, [title, html, status, atLocal, localBook && localBook.slug, index]);

  /* Đóng tab / ẩn trang / rời trang quản trị: ghi nốt nháp rồi mới đi */
  useEffect(() => {
    const flush = () => flushDraft();
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
      flush();
    };
  }, []);

  const stat = useMemo(() => htmlStats(html), [html]);
  const temps = useMemo(() => tempMediaInHtml(htmlForStorage(html || '', apiBase)), [html, apiBase]);
  const dirty = title !== baseRef.current.title || html !== baseRef.current.html || status !== baseRef.current.status || atLocal !== baseRef.current.atLocal;
  const scheduleNote = scheduleWarning({ status, at: localInputToIso(atLocal) });
  const pendingNow = isChapterPending({ status, at: localInputToIso(atLocal) });

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
    if (status === 'scheduled' && !localInputToIso(atLocal)) {
      toast('Chọn ngày giờ cho chương hẹn giờ trước khi lưu.', 'err');
      return;
    }
    const chapterPayload = {
      t: title || ('Chương ' + (index + 1)),
      html: htmlForStorage(html || '', apiBase),
      status,
      at: status === 'scheduled' ? localInputToIso(atLocal) : '',
    };
    const started = Date.now();
    setSaving(true);
    /* bản cục bộ sau khi lưu: phải cập nhật NGAY, kẻo rời chương rồi quay lại
       lại đọc bản cũ trong localBook mà tưởng chương vừa lưu bị mất chữ */
    const next = clone(localBook);
    next.chapters = Array.isArray(next.chapters) ? next.chapters : [];
    if (!next.chapters[index]) next.chapters[index] = { t: chapterPayload.t, html: '' };
    next.chapters[index] = Object.assign({}, next.chapters[index], chapterPayload);
    if (chapterPayload.status !== 'scheduled') delete next.chapters[index].at;
    try {
      if (onSaveChapter && online) {
        /* đường NHANH: chỉ gửi 1 chương (trước đây gửi nguyên bộ + cả registry) */
        await onSaveChapter(localBook.slug || slug, index, chapterPayload);
      } else {
        await onSaveBook(next);
      }
      setLocalBook(next);
      baseRef.current = { title, html, status, atLocal };
      dropDraft(localBook.slug || slug, index);
      clearDraftNote(index);
      setDraft(null);
      setRestored(false);
      setDraftPhase('');
      setSavedMs(Date.now() - started);
    } catch (e) { /* onSaveChapter/onSaveBook đã toast lỗi; giữ nháp để không mất chữ */ }
    finally { setSaving(false); }
  };
  const addChapter = () => {
    flushDraft();
    const next = clone(localBook || { title: slug, slug, chapters: [] });
    next.chapters = Array.isArray(next.chapters) ? next.chapters : [];
    /* gợi ý số chương CHÍNH kế tiếp (bỏ qua Lời mở đầu / giới thiệu nhân vật /
       ngoại truyện) — trước đây cứ length+1 nên bộ có mở đầu bị gọi sai số */
    /* chương mới mặc định XUẤT BẢN: đây vẫn là hành vi cũ trên thực tế (trạng
       thái chương chưa từng chặn hiển thị), nay ghi thẳng ra cho khỏi hiểu nhầm;
       muốn giữ riêng thì chọn “Hẹn giờ” hoặc “Ẩn” ngay trên ô trạng thái */
    next.chapters.push({ t: suggestChapterTitle(next.chapters), html: '<p></p>', status: 'published' });
    setLocalBook(next); setRestored(false); setIndex(next.chapters.length - 1);
  };
  const deleteChapter = async () => {
    if (!localBook || !chapters[index]) return;
    if (!window.confirm('Xoá chương ' + (index + 1) + ' — ' + (chapters[index].t || '') + '?')) return;
    const typed = window.prompt('Gõ XOÁ để xác nhận xoá chương:', '');
    if (typed !== 'XOÁ') return;
    const slugNow = localBook.slug || slug;
    try {
      if (onDeleteChapter && online) await onDeleteChapter(slugNow, index);
      else {
        const next = clone(localBook);
        next.chapters.splice(index, 1);
        await onSaveBook(next);
        setLocalBook(next);
      }
      dropDraft(slugNow, index);
      clearDraftNote(index);
      setRestored(false);
      setIndex(Math.max(0, Math.min(index - 1, chapters.length - 2)));
    } catch (e) { /* đã toast lỗi */ }
  };
  const moveChapter = async (delta) => { await reorderChapter(index, index + delta); };
  const reorderChapter = async (from, to) => {
    if (!localBook || from === to || from < 0 || to < 0 || to >= chapters.length) return;
    flushDraft();
    try {
      if (onMoveChapter && online) await onMoveChapter(localBook.slug || slug, from, to);
      else {
        const next = clone(localBook);
        const [item] = next.chapters.splice(from, 1);
        next.chapters.splice(to, 0, item);
        await onSaveBook(next);
        setLocalBook(next);
      }
      setIndex(to);
    } catch (e) { /* đã toast lỗi */ }
  };
  const restoreDraft = () => {
    if (!draft) return;
    const draftHtml = htmlForEditor(draft.html || html, apiBase);
    patchLive({ title: draft.title || title, html: draftHtml, status: draft.status || status, atLocal: draft.atLocal || '' });
    setTitle(draft.title || title);
    setHtml(draftHtml);
    setStatus(draft.status || status);
    setAtLocal(draft.atLocal || '');
    setRestored(true);
    if (editor) editor.commands.setContent(draftHtml || '<p></p>', false);
  };
  /* Bỏ thay đổi chưa lưu: quay về đúng bản đang có trên Worker */
  const discardChanges = () => {
    const base = baseRef.current;
    patchLive({ title: base.title, html: base.html, status: base.status, atLocal: base.atLocal });
    setTitle(base.title);
    setHtml(base.html);
    setStatus(base.status);
    setAtLocal(base.atLocal);
    if (editor) editor.commands.setContent(base.html || '<p></p>', false);
    dropDraft(localBook.slug || slug, index);
    clearDraftNote(index);
    setDraft(null); setRestored(false); setDraftPhase('');
    toast('Đã bỏ thay đổi chưa lưu (về bản trên Worker).', 'info');
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
    flushDraft();
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
      setReloadTick((n) => n + 1);
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
      const url = await onUploadImage(file, { kind: 'chapter' });
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

  /* Đăng ký phím tắt: Ctrl/Cmd+S lưu chương đang mở; Ctrl/Cmd+N thêm chương
     mới. Đăng ký trong ChapterEditor (chứ không phải BookEditor) vì đây là
     thành phần biết rõ chương hiện tại và đang có dữ liệu thật hay không. */
  useEffect(() => {
    if (!shortcuts) return;
    const saveHandler = () => {
      /* chỉ xử lý khi người dùng đang làm việc trong khối chương (tiêu đề
         chương / editor / các select chương), không ăn của form metadata. */
      const ae = document.activeElement;
      const card = cardRef.current;
      if (card && ae && !card.contains(ae)) return false;
      if (!localBook) return false;
      if (saving) return true; /* đang lưu rồi, chặn double-submit */
      if (writeBlocked) { toast('Quota KV hôm nay đã hết — không ghi.', 'err'); return true; }
      saveChapter();
      return true;
    };
    const newHandler = () => {
      if (!localBook) return false;
      addChapter();
      return true;
    };
    shortcuts.registerSave(saveHandler);
    if (shortcuts.registerNewChapter) shortcuts.registerNewChapter(newHandler);
    return () => {
      shortcuts.unregisterSave && shortcuts.unregisterSave(saveHandler);
      shortcuts.unregisterNewChapter && shortcuts.unregisterNewChapter(newHandler);
    };
  }, [shortcuts, localBook && localBook.slug, index, saving, writeBlocked, title, html, status, atLocal, temps.length, online]);

  if (!localBook && !loading) {
    return <section class="card2" ref={cardRef}><div class="row"><h3>Chương</h3><span class="grow"></span><button class="btn ghost sm" type="button" onClick={() => onLoad && onLoad()}>Đọc dữ liệu chương</button></div><p class="hint">Chưa có dữ liệu chương trong cache.</p></section>;
  }
  return (
    <section class="card2 v2chapter-card" ref={cardRef}>
      <div class="row"><h3>Chương</h3><span class="grow"></span><button class="btn ghost sm" type="button" onClick={addChapter} title="Thêm chương mới · Ctrl/Cmd+N">Thêm chương</button><button class="btn ghost sm" type="button" disabled={!chapters.length} onClick={() => moveChapter(-1)}>Lên</button><button class="btn ghost sm" type="button" disabled={!chapters.length} onClick={() => moveChapter(1)}>Xuống</button></div>
      <p class="hint">Editor dùng TipTap; output vẫn là HTML lưu trong <code>chapters[].html</code>. Nháp tự lưu vào máy này (localStorage) sau 0,7 giây ngừng gõ — đổi chương hay đóng tab đều ghi nháp trước, không mất chữ.</p>
      {loading ? <div class="empty sm">Đang đọc chương…</div> : null}
      <div class="v2chapter-grid">
        <aside class="v2chapter-list">
          {chapters.length ? chapters.map((chapter, i) => {
            const kind = chapterKind(chapter.t || '');
            const kindTag = kind === 'open' ? 'Mở đầu' : (kind === 'extra' ? 'Ngoại truyện' : '');
            const sched = scheduleLabelOf(chapter);
            const local = draftMap[i] || null;
            return (
              <button type="button" class={i === index ? 'on' : ''} key={i} draggable="true"
                onDragStart={() => setDragFrom(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); reorderChapter(dragFrom, i); setDragFrom(-1); }}
                onClick={() => gotoIndex(i)}>
                <b>{i + 1}</b><span>{chapter.t || ('Chương ' + (i + 1))}</span>
                <em>{kindTag ? kindTag + ' · ' : ''}{quickWords(chapter.html)} từ{chapter.status && chapter.status !== 'published' ? ' · ' + (sched || (chapterStatusOf(chapter) === 'hidden' ? 'Đang ẩn' : 'Nháp')) : ''}{local ? ' · có nháp' : ''}</em>
              </button>
            );
          }) : <div class="empty sm">Chưa có chương.</div>}
        </aside>
        <div class="v2chapter-editor">
          <label class="fl">Tên chương</label>
          <input class="inp" value={title} onInput={(e) => { const v = e.currentTarget.value; patchLive({ title: v }); setTitle(v); }} placeholder={'Chương ' + (index + 1)} />
          <label class="fl">Trạng thái chương
            <select class="inp" value={status} onChange={(e) => {
              const value = e.target.value;
              patchLive({ status: value });
              setStatus(value);
              /* chọn Hẹn giờ mà chưa có mốc → gợi ý sẵn 20:00 hôm nay (hoặc +1 giờ
                 nếu đã qua 20:00) để không lưu ra chương “hẹn giờ không có giờ” */
              if (value === 'scheduled' && !atLocal) {
                const today20 = new Date();
                today20.setHours(20, 0, 0, 0);
                const auto = isoToLocalInput((today20.getTime() > Date.now() ? today20 : new Date(Date.now() + 3600000)).toISOString());
                patchLive({ atLocal: auto });
                setAtLocal(auto);
              }
            }}>
              {CHAPTER_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          <p class="hint">{(CHAPTER_STATUSES.find((s) => s.id === status) || {}).hint || ''}</p>
          {status === 'scheduled' ? (
            <div class="v2sched">
              <label class="fl">Chương lên sóng lúc
                <input class="inp" type="datetime-local" value={atLocal} onInput={(e) => { const v = e.currentTarget.value; patchLive({ atLocal: v }); setAtLocal(v); }} />
              </label>
              <div class="row">
                <button class="btn ghost sm" type="button" onClick={() => { const v = localInputPlus(1); patchLive({ atLocal: v }); setAtLocal(v); toast('Đã đặt +1 giờ — bấm Lưu chương để áp dụng.', 'info'); }}>+1 giờ</button>
                <button class="btn ghost sm" type="button" onClick={() => { const v = localInputPlus(24); patchLive({ atLocal: v }); setAtLocal(v); toast('Đã đặt +1 ngày — bấm Lưu chương để áp dụng.', 'info'); }}>+1 ngày</button>
                <button class="btn ghost sm" type="button" onClick={() => { const v = localInputPlus(168); patchLive({ atLocal: v }); setAtLocal(v); toast('Đã đặt +1 tuần — bấm Lưu chương để áp dụng.', 'info'); }}>+1 tuần</button>
              </div>
              <p class="hint">
                {pendingNow
                  ? 'Đang chờ: độc giả chưa thấy chương này' + (hoursUntil(chapterAtMs({ at: localInputToIso(atLocal) })) ? ' — còn khoảng ' + hoursUntil(chapterAtMs({ at: localInputToIso(atLocal) })) + ' giờ nữa.' : '.')
                  : 'Mốc giờ đã qua — chương sẽ hiện ngay sau khi lưu.'}
              </p>
            </div>
          ) : null}
          {scheduleNote ? <p class="hint v2sched-warn">{scheduleNote}</p> : null}
          {(status === 'scheduled' || status === 'hidden') && index < chapters.length - 1 ? (
            <p class="hint v2sched-warn">Chương này KHÔNG nằm cuối bộ: lúc chưa lên sóng, số thứ tự các chương sau tạm dịch với truyện không ghi số trong tên chương. Chỉ hẹn giờ/ẩn chương cuối là an toàn nhất.</p>
          ) : null}
          <Toolbar editor={editor} />
          <div class="v2tiphost" ref={setHost}></div>
          <p class="v2draft-status">
            {saving ? <span>Đang gửi lên Worker…</span> : null}
            {!saving && draftPhase === 'saving' ? <span>Đang lưu nháp cục bộ…</span> : null}
            {!saving && draftPhase === 'saved' && draft && !restored ? <span>Đã lưu nháp cục bộ lúc {fmtTime(draft.at)}</span> : null}
            {!saving && savedMs ? <span>Đã lưu lên Worker trong {fmtMs(savedMs)}</span> : null}
            {dirty && !saving ? <span> · <b>Chưa ghi vào Cloudflare KV</b></span> : null}
            {!online ? <span> · Nháp phiên (dữ liệu tĩnh)</span> : null}
          </p>
          {restored && draft ? (
            <div class="msgbar show info">
              Đã tự khôi phục bản nháp lúc {fmtTime(draft.at)} (chưa ghi lên Worker).
              <span class="grow"></span>
              <button class="btn ghost sm" type="button" onClick={discardChanges}>Bỏ thay đổi chưa lưu</button>
            </div>
          ) : null}
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
            {draft && !restored ? <button class="btn ghost sm" type="button" onClick={restoreDraft}>Khôi phục nháp</button> : null}
            <button class="btn ghost sm" type="button" onClick={() => setPreview(!preview)}>{preview ? 'Ẩn preview' : 'Preview độc giả'}</button>
            <button class="btn pri sm" type="button" disabled={writeBlocked || !!temps.length || saving} title={(writeBlocked ? 'Quota KV hôm nay đã hết — nháp cục bộ vẫn được giữ' : (online ? 'Ghi chương vào Cloudflare KV (chỉ gửi 1 chương)' : 'Chỉ lưu nháp phiên — chưa ghi Cloudflare KV')) + ' · Ctrl/Cmd+S'} onClick={saveChapter}>{saving ? 'Đang lưu…' : (writeBlocked ? 'Hết quota KV' : (online ? 'Lưu chương' : 'Lưu nháp phiên'))}</button>
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
