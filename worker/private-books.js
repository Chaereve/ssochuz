/* Private content never enters KV, public feeds, static exports or edge caches. */
export class PrivateBooks {
  constructor(state) { this.state = state; }
  async fetch(req) {
    // Serialize attempts and password changes, including concurrent requests.
    return this.state.blockConcurrencyWhile(async () => {
      const reply = (data, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'private, no-store' } });
      const body = await req.json();
      const record = await this.state.storage.get('record');
      if (req.method === 'PUT') {
        if (typeof body.password !== 'string' || body.password.length < 16 || body.password.length > 256)
          return reply({ error: 'Mật khẩu cần từ 16 đến 256 ký tự.' }, 400);
        if (!body.book || !Array.isArray(body.book.chapters) || !body.book.title)
          return reply({ error: 'Cần tiêu đề và danh sách chương.' }, 400);
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const hash = await digest(body.password, salt);
        await this.state.storage.put('record', { salt: [...salt], hash: [...hash], book: body.book });
        await this.state.storage.delete('attempts');
        return reply({ ok: true });
      }
      if (!record) return reply({ error: 'Không tìm thấy truyện riêng tư.' }, 404);
      let attempts = await this.state.storage.get('attempts');
      if (!attempts || Date.now() >= attempts.until) attempts = { count: 0, until: Date.now() + 900000 };
      if (attempts.count >= 20) return reply({ error: 'Quá nhiều lần thử. Vui lòng quay lại sau 15 phút.' }, 429);
      attempts.count++;
      await this.state.storage.put('attempts', attempts);
      if (typeof body.password !== 'string' || body.password.length > 256) return reply({ error: 'Mật khẩu không đúng.' }, 403);
      const hash = await digest(body.password, new Uint8Array(record.salt));
      let diff = 0;
      for (let i = 0; i < hash.length; i++) diff |= hash[i] ^ record.hash[i];
      if (diff) return reply({ error: 'Mật khẩu không đúng.' }, 403);
      await this.state.storage.delete('attempts');
      return reply(record.book);
    });
  }
}
async function digest(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256));
}
