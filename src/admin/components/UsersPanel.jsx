import { h } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { genreNameOf } from '../utils/genres.js';

export function UsersPanel({ registry, onEdit }) {
  const lib = (registry && registry.lib) || [];
  const authors = useMemo(() => {
    const map = {};
    lib.forEach((b) => {
      const name = String(b.author || '').trim() || 'Chưa rõ tác giả';
      const row = map[name] || (map[name] = { name, books: [], chapters: 0 });
      row.books.push(b);
      row.chapters += Number(b.chapters) || 0;
    });
    return Object.keys(map).map((k) => map[k]).sort((a, b) => b.books.length - a.books.length || a.name.localeCompare(b.name, 'vi'));
  }, [lib]);
  const [q, setQ] = useState('');
  const shown = authors.filter((a) => !q || a.name.toLowerCase().indexOf(q.toLowerCase()) >= 0);

  return (
    <div id="pane-users" class="v2pane">
      <section class="card2">
        <div class="row"><h3>Tác giả</h3><span class="grow"></span><span class="sm muted">{authors.length} người · lấy từ metadata bộ truyện</span></div>
        <p class="hint">Worker KV không có bảng độc giả. Danh sách dưới đây là tác giả đã gắn vào sách. Hồ sơ độc giả (My Space) nằm trên Durable Object riêng, không giả số liệu.</p>
        <input class="inp" value={q} placeholder="Tìm tác giả…" onInput={(e) => setQ(e.target.value)} />
        {shown.length ? (
          <div class="v2tablewrap">
            <table class="v2book-table">
              <thead><tr><th>Tác giả</th><th>Số bộ</th><th>Chương</th><th>Thể loại</th><th></th></tr></thead>
              <tbody>
                {shown.map((a) => (
                  <tr key={a.name}>
                    <td><b>{a.name}</b></td>
                    <td>{a.books.length}</td>
                    <td>{a.chapters}</td>
                    <td>{[...new Set(a.books.map((b) => genreNameOf(b, registry)).filter(Boolean))].slice(0, 3).join(', ') || '—'}</td>
                    <td><button class="btn ghost sm" type="button" onClick={() => onEdit && onEdit(a.books[0].slug)}>Mở bộ đầu</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div class="empty">Không có tác giả khớp.</div>}
      </section>
      <section class="card2">
        <h3>Độc giả</h3>
        <div class="empty">Chưa có API danh sách độc giả trên KV. Đăng nhập người đọc dùng Supabase Auth; không bịa số liệu.</div>
      </section>
    </div>
  );
}
