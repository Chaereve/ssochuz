/* One strongly consistent object per verified user. No private shelf copies in KV.

   Hồ sơ khởi tạo: khi không gian còn trống (version 0) mà Worker đã xác thực được
   danh tính, tên/ảnh của tài khoản (Google) được gửi kèm qua header
   `x-cz-name` / `x-cz-pic` và được dùng luôn làm hồ sơ đầu tiên. Trước đây hồ sơ
   luôn bắt đầu bằng "Bạn đọc" + ảnh rỗng, nên người vừa đăng nhập đã thấy tên
   chung chung — và nếu họ chỉ đổi mô tả rồi lưu thì "Bạn đọc" bị ghi vĩnh viễn.

   Ảnh đại diện nhận hai dạng:
     · data:image/(png|jpeg|webp);base64,… (ảnh người dùng tự cắt, ≤ 250 000 ký tự)
     · https://… (ảnh tài khoản Google, ≤ 2048 ký tự — chỉ đọc, không cho http). */
export async function profileId(uid) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ssochuz-profile-v1:' + uid));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const DATA_IMG = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
function avatarValue(value, strict) {
  const s = String(value == null ? '' : value).trim();
  if (!s) return '';
  if (/^https:\/\//i.test(s)) return s.length <= 2048 ? s : '';
  if (DATA_IMG.test(s)) return s.length <= 250000 ? s : '';
  if (strict) throw Error('Ảnh phải là PNG, JPEG hoặc WebP, dưới 180 KB sau khi nén.');
  return '';
}
function seededName(raw) {
  let name = '';
  try { name = decodeURIComponent(raw || ''); } catch { name = ''; }
  name = name.replace(/\s+/g, ' ').trim().slice(0, 40);
  return name && name !== 'Bạn đọc' ? name : '';
}
function seededPic(raw) {
  let pic = '';
  try { pic = decodeURIComponent(raw || ''); } catch { pic = ''; }
  return avatarValue(pic.slice(0, 2048), false);
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
      /* không gian mới: lấy luôn danh tính tài khoản đã xác thực làm hồ sơ đầu */
      let seeded = false;
      if (!doc) {
        const name = seededName(req.headers.get('x-cz-name'));
        const pic = seededPic(req.headers.get('x-cz-pic'));
        doc = { version: 0, profile: { name: name || 'Bạn đọc', bio: '', avatar: pic, avatarOff: false }, shelves: [] };
        seeded = !!(name || pic);
      }
      if (req.method === 'GET') {
        /* ghi lại hồ sơ vừa gieo để hồ sơ công khai + máy khác thấy đúng danh tính */
        if (seeded) await this.state.storage.put('space', doc);
        return reply(doc);
      }
      if (req.method !== 'PUT') return reply({ error: 'Không được phép.' }, 405);
      let body;
      try { body = await req.json(); } catch { return reply({ error: 'Dữ liệu không hợp lệ.' }, 400); }
      if (!body || body.version !== doc.version) return reply({ error: 'Dữ liệu đã thay đổi ở tab khác. Hãy tải lại trước khi lưu.' }, 409);
      if (['profile', 'shelf', 'deleteShelf'].filter(k => body[k] !== undefined).length !== 1) return reply({ error: 'Chỉ gửi một thay đổi mỗi lần.' }, 400);
      try {
        if (body.profile !== undefined) {
          const p = body.profile;
          const name = text(p.name, 40, true), bio = text(p.bio, 500);
          const avatar = avatarValue(p.avatar, true);
          if (avatar && avatar.indexOf('data:') === 0) {
            const bytes = atob(avatar.split(',')[1]);
            if (!(bytes.startsWith('\x89PNG\r\n\x1a\n') || bytes.startsWith('\xff\xd8\xff') || (bytes.startsWith('RIFF') && bytes.slice(8,12) === 'WEBP'))) throw Error('Tệp ảnh không hợp lệ.');
          }
          /* Ba ca, đừng trộn lại:
               · có ảnh            → dùng ảnh đó;
               · ảnh rỗng + avatarOff = người dùng bấm "Bỏ ảnh" → xoá hẳn;
               · ảnh rỗng, không cờ → khách cũ chỉ gửi tên → GIỮ ảnh cũ, không xoá oan. */
          let nextAvatar, nextOff;
          if (avatar) { nextAvatar = avatar; nextOff = false; }
          else if (p.avatarOff) { nextAvatar = ''; nextOff = true; }
          else { nextAvatar = doc.profile.avatar || ''; nextOff = !!doc.profile.avatarOff; }
          doc.profile = { name, bio, avatar: nextAvatar, avatarOff: nextOff };
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
