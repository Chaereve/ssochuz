import { h } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { booksUsingGenre, listGenres, normalizeGenre } from '../utils/genres.js';
import { slugify } from '../utils/books.js';

export function GenreManager({ registry, onSave }) {
  const genres = listGenres(registry);
  const [form, setForm] = useState({ name: '', slug: '', description: '', display_order: genres.length + 1, is_visible: true });
  const [editing, setEditing] = useState('');
  const [mergeFrom, setMergeFrom] = useState('');
  const [mergeTo, setMergeTo] = useState('');
  const used = useMemo(() => {
    const map = {};
    genres.forEach((g) => { map[g.slug] = booksUsingGenre(registry, g.slug).length + booksUsingGenre(registry, g.name).length; });
    return map;
  }, [registry, genres]);

  function update(k, v) { setForm((f) => Object.assign({}, f, { [k]: v, slug: k === 'name' && !editing ? slugify(v) : (k === 'slug' ? slugify(v) : f.slug) })); }

  async function saveList(next, msg) {
    await onSave(next, msg);
  }

  async function addOrUpdate(e) {
    e.preventDefault();
    const g = normalizeGenre(form, form.display_order);
    if (!g.name) return;
    let next = genres.slice();
    const i = next.findIndex((x) => x.slug === (editing || g.slug));
    if (i >= 0) {
      const old = next[i];
      next[i] = g;
      if (old.slug !== g.slug) {
        /* đổi slug thì cập nhật sách đang dùng thể loại cũ */
        await onSave(next, 'Đã sửa thể loại “' + g.name + '”', { remap: { from: old.slug, to: g.slug } });
        setEditing(''); setForm({ name: '', slug: '', description: '', display_order: next.length + 1, is_visible: true });
        return;
      }
    } else {
      if (next.some((x) => x.slug === g.slug)) { window.alert('Slug thể loại đã tồn tại.'); return; }
      next.push(g);
    }
    await saveList(next, i >= 0 ? 'Đã sửa thể loại “' + g.name + '”' : 'Đã thêm thể loại “' + g.name + '”');
    setEditing(''); setForm({ name: '', slug: '', description: '', display_order: next.length + 1, is_visible: true });
  }

  async function remove(g) {
    const n = used[g.slug] || 0;
    if (n) { window.alert('Không xoá được “' + g.name + '”: còn ' + n + ' bộ đang dùng. Hãy gộp vào thể loại khác trước.'); return; }
    if (!window.confirm('Xoá thể loại “' + g.name + '”?')) return;
    await saveList(genres.filter((x) => x.slug !== g.slug), 'Đã xoá thể loại “' + g.name + '”');
  }

  async function merge(e) {
    e.preventDefault();
    if (!mergeFrom || !mergeTo || mergeFrom === mergeTo) return;
    const src = genres.find((g) => g.slug === mergeFrom);
    const dst = genres.find((g) => g.slug === mergeTo);
    if (!src || !dst) return;
    const n = (used[src.slug] || 0);
    if (!window.confirm('Gộp “' + src.name + '” vào “' + dst.name + '”? ' + n + ' truyện sẽ đổi thể loại, rồi xoá thể loại nguồn.')) return;
    const next = genres.filter((g) => g.slug !== mergeFrom);
    await onSave(next, 'Đã gộp thể loại “' + src.name + '” → “' + dst.name + '”', { remap: { from: mergeFrom, to: mergeTo } });
    setMergeFrom(''); setMergeTo('');
  }

  return (
    <div id="pane-genres" class="v2pane">
      <section class="card2">
        <div class="row"><h3>Thể loại</h3><span class="grow"></span><span class="sm muted">{genres.length} thể loại</span></div>
        <p class="hint">Danh mục thể loại dùng khi gán cho từng bộ. Xoá thể loại đang được dùng sẽ bị chặn.</p>
        <form class="v2form" onSubmit={addOrUpdate}>
          <label class="fl">{editing ? 'Sửa thể loại' : 'Thể loại mới'}
            <input class="inp" value={form.name} placeholder="Tên hiển thị" onInput={(e) => update('name', e.target.value)} required />
          </label>
          <label class="fl">Slug
            <input class="inp" value={form.slug} onInput={(e) => update('slug', e.target.value)} />
          </label>
          <label class="fl">Mô tả
            <input class="inp" value={form.description} onInput={(e) => update('description', e.target.value)} />
          </label>
          <label class="fl">Thứ tự
            <input class="inp" type="number" min="1" value={form.display_order} onInput={(e) => update('display_order', Number(e.target.value) || 1)} />
          </label>
          <label class="chk"><input type="checkbox" checked={form.is_visible} onChange={(e) => update('is_visible', e.target.checked)} /> Hiện trên web</label>
          <div class="row">
            <button class="btn pri" type="submit">{editing ? 'Lưu thể loại' : 'Thêm thể loại'}</button>
            {editing ? <button class="btn ghost" type="button" onClick={() => { setEditing(''); setForm({ name: '', slug: '', description: '', display_order: genres.length + 1, is_visible: true }); }}>Huỷ</button> : null}
          </div>
        </form>
      </section>
      <section class="card2">
        <h3>Danh sách</h3>
        <div class="v2tablewrap">
          <table class="v2book-table">
            <thead><tr><th>Tên</th><th>Slug</th><th>Thứ tự</th><th>Sách</th><th>Hiện</th><th></th></tr></thead>
            <tbody>
              {genres.map((g) => (
                <tr key={g.slug}>
                  <td><b>{g.name}</b>{g.description ? <div class="sm muted">{g.description}</div> : null}</td>
                  <td><code>{g.slug}</code></td>
                  <td>{g.display_order}</td>
                  <td>{used[g.slug] || 0}</td>
                  <td>{g.is_visible ? 'có' : 'ẩn'}</td>
                  <td class="v2acts">
                    <button class="btn ghost sm" type="button" onClick={() => { setEditing(g.slug); setForm(g); }}>Sửa</button>
                    <button class="btn ghost sm" type="button" onClick={() => remove(g)}>Xoá</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section class="card2">
        <h3>Gộp thể loại</h3>
        <form class="v2form row" onSubmit={merge}>
          <select class="inp" value={mergeFrom} onChange={(e) => setMergeFrom(e.target.value)}>
            <option value="">Từ thể loại…</option>
            {genres.map((g) => <option key={g.slug} value={g.slug}>{g.name}</option>)}
          </select>
          <select class="inp" value={mergeTo} onChange={(e) => setMergeTo(e.target.value)}>
            <option value="">Sang thể loại…</option>
            {genres.map((g) => <option key={g.slug} value={g.slug}>{g.name}</option>)}
          </select>
          <button class="btn" type="submit">Gộp</button>
        </form>
      </section>
    </div>
  );
}
