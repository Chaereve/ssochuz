/* One strongly consistent object per verified user. No private shelf copies in KV. */
export async function profileId(uid) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ssochuz-profile-v1:' + uid));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export class MemberSpaces {
  constructor(state) { this.state = state; }
  async fetch(req) {
    return this.state.blockConcurrencyWhile(async () => {
      const reply = (data, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'private, no-store' } });
      const publicRead = new URL(req.url).pathname === '/public';
      let doc = await this.state.storage.get('space');
      if (publicRead) {
        if (req.method !== 'GET') return reply({ error: 'Không được phép.' }, 405);
        if (!doc) return reply({ error: 'Người đọc này chưa tạo hồ sơ.' }, 404);
        return reply({ profile: doc.profile, shelves: doc.shelves.filter(s => s.visibility === 'public') });
      }
      if (!doc) doc = { version: 0, profile: { name: 'Bạn đọc', bio: '', avatar: '' }, shelves: [] };
      if (req.method === 'GET') return reply(doc);
      if (req.method !== 'PUT') return reply({ error: 'Không được phép.' }, 405);
      let body;
      try { body = await req.json(); } catch { return reply({ error: 'Dữ liệu không hợp lệ.' }, 400); }
      if (!body || body.version !== doc.version) return reply({ error: 'Dữ liệu đã thay đổi ở tab khác. Hãy tải lại trước khi lưu.' }, 409);
      if (['profile', 'shelf', 'deleteShelf'].filter(k => body[k] !== undefined).length !== 1) return reply({ error: 'Chỉ gửi một thay đổi mỗi lần.' }, 400);
      try {
        if (body.profile !== undefined) {
          const p = body.profile;
          const name = text(p.name, 40, true), bio = text(p.bio, 500);
          const avatar = p.avatar || '';
          if (typeof avatar !== 'string' || avatar.length > 250000 || (avatar && !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(avatar))) throw Error('Ảnh phải là PNG, JPEG hoặc WebP, dưới 180 KB sau khi nén.');
          if (avatar) {
            const bytes = atob(avatar.split(',')[1]);
            if (!(bytes.startsWith('\x89PNG\r\n\x1a\n') || bytes.startsWith('\xff\xd8\xff') || (bytes.startsWith('RIFF') && bytes.slice(8,12) === 'WEBP'))) throw Error('Tệp ảnh không hợp lệ.');
          }
          doc.profile = { name, bio, avatar };
        } else if (body.shelf !== undefined) {
          const s = body.shelf;
          if (!s || !['private', 'public'].includes(s.visibility)) throw Error('Chọn quyền riêng tư cho tủ.');
          if (!Array.isArray(s.books) || s.books.length > 200 || s.books.some(slug => typeof slug !== 'string' || !/^[a-z0-9-]{1,160}$/.test(slug) || slug.startsWith('private-'))) throw Error('Tủ chứa tối đa 200 truyện trong thư viện công khai.');
          const id = s.id || crypto.randomUUID();
          const idx = doc.shelves.findIndex(x => x.id === id);
          if (s.id && idx < 0) return reply({ error: 'Không tìm thấy tủ của bạn.' }, 404);
          if (idx < 0 && doc.shelves.length >= 24) throw Error('Bạn có thể tạo tối đa 24 tủ.');
          const shelf = { id, name: text(s.name, 60, true), description: text(s.description, 300), visibility: s.visibility, books: [...new Set(s.books)], updatedAt: new Date().toISOString() };
          if (idx < 0) doc.shelves.push(shelf); else doc.shelves[idx] = shelf;
        } else {
          if (!doc.shelves.some(s => s.id === body.deleteShelf)) return reply({ error: 'Không tìm thấy tủ của bạn.' }, 404);
          doc.shelves = doc.shelves.filter(s => s.id !== body.deleteShelf);
        }
      } catch (e) { return reply({ error: e.message }, 400); }
      doc.version++;
      await this.state.storage.put('space', doc);
      return reply(doc);
    });
  }
}
function text(value, max, required = false) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw Error('Kiểm tra tên và độ dài nội dung.');
  return value.trim();
}
