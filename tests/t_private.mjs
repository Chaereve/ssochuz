import assert from 'node:assert/strict';
import { PrivateBooks } from '../worker/private-books.js';
import worker from '../worker/cms.js';
const db = new Map();
let queue = Promise.resolve();
const object = new PrivateBooks({
  storage: { get: async k => structuredClone(db.get(k)), put: async (k,v) => db.set(k,structuredClone(v)), delete: async k => db.delete(k) },
  blockConcurrencyWhile(fn) { const next = queue.then(fn); queue = next.catch(()=>{}); return next; }
});
const env = { ADMIN_KEY: 'a'.repeat(32), PRIVATE_BOOKS: { idFromName: x => x, get: () => object } };
const request = (method, body, admin = false, path = '/api/private/private-test') => worker.fetch(new Request('https://test.example'+path, { method, headers: admin ? { 'x-admin-key': env.ADMIN_KEY } : {}, ...(body ? {body:JSON.stringify(body)} : {}) }), env, {});
const book = {title:'Riêng tư', chapters:[{t:'Một',html:'SECRET CONTENT'}]};
assert.equal((await request('PUT',{password:'long password 123456',book})).status,401);
assert.equal((await request('PUT',{password:'short',book},true)).status,400);
assert.equal((await request('PUT',{password:'long password 123456',book},true)).status,200);
assert.ok(!JSON.stringify(db.get('record')).includes('long password'));
for (const path of ['/api/book/private-test','/api/private/private-test']) {
 const r = await request('GET',null,false,path); assert.equal(r.status,403); assert.ok(!(await r.text()).includes('SECRET CONTENT'));
}
assert.equal((await request('POST',{password:'wrong'})).status,403);
let r = await request('POST',{password:'long password 123456'});
assert.equal(r.status,200); assert.match(r.headers.get('cache-control'),/no-store/); assert.deepEqual(await r.json(),book);
const attempts = await Promise.all(Array.from({length:25},()=>request('POST',{password:'wrong'})));
assert.equal(attempts.filter(r=>r.status===403).length,20); assert.equal(attempts.filter(r=>r.status===429).length,5);
assert.equal((await request('POST',{password:'long password 123456'})).status,429);
assert.equal((await request('PUT',{password:'changed password 123456',book},true)).status,200);
assert.equal((await request('POST',{password:'long password 123456'})).status,403);
assert.equal((await request('POST',{password:'changed password 123456'})).status,200);
const unavailable = await worker.fetch(new Request('https://test/api/private/private-test',{method:'POST',body:'{}'}),{},{});
assert.equal(unavailable.status,503);
console.log('Private books: auth, hash, no-store, GET denial, concurrent throttling, rotation, fail-closed passed.');
