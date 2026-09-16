import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import worker from '../worker/cms.js';
import {MemberSpaces,profileId} from '../worker/member-spaces.js';
const objects=new Map();
function object(id){if(!objects.has(id)){const db=new Map();let q=Promise.resolve();objects.set(id,new MemberSpaces({storage:{get:async k=>structuredClone(db.get(k)),put:async(k,v)=>db.set(k,structuredClone(v))},blockConcurrencyWhile(fn){const next=q.then(fn);q=next.catch(()=>{});return next;}}));}return objects.get(id);}
const kv=new Map();const env={SESSION_SECRET:'s'.repeat(48),CZ_KV:{get:async(k,opt)=>opt?.type==='json'?JSON.parse(kv.get(k)||'null'):kv.get(k)||null,put:async(k,v)=>kv.set(k,v),delete:async k=>kv.delete(k),list:async()=>({keys:[],list_complete:true})},MEMBER_SPACES:{idFromName:x=>x,get:object}};
function token(uid,expired=false){const data=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({uid,email:uid+'@private.test',name:'Secret Auth Name',exp:Math.floor(Date.now()/1000)+(expired?-100:3600)})).toString('base64url');return data+'.'+crypto.createHmac('sha256',env.SESSION_SECRET).update(data).digest('base64url');}
async function call(path,method='GET',body,who){const headers={'content-type':'application/json'};if(who)headers.authorization='Bearer '+token(who);const res=await worker.fetch(new Request('https://test'+path,{method,headers,body:body?JSON.stringify(body):undefined}),env,{});return {res,data:await res.json()};}
let r=await call('/api/me/space');assert.equal(r.res.status,401);
r=await call('/api/me/space','GET',null,'alice');assert.equal(r.res.status,200);const id=r.data.id;assert.equal(id,await profileId('alice'));assert.match(r.res.headers.get('cache-control'),/no-store/);
assert.ok(!JSON.stringify(r.data).includes('@'));
r=await call('/api/me/space?uid=bob','PUT',{version:0,profile:{name:'Alice',bio:'<script>not executed</script>',avatar:''}},'alice');assert.equal(r.res.status,200);
r=await call('/api/me/space','PUT',{version:1,shelf:{name:'Private diary',description:'SECRET DESCRIPTION',books:['third-person'],visibility:'private'}},'alice');assert.equal(r.res.status,200);const secretId=r.data.shelves[0].id;
r=await call('/api/profiles/'+id);assert.equal(r.data.shelves.length,0);assert.ok(!JSON.stringify(r.data).includes('SECRET'));assert.ok(!JSON.stringify(r.data).includes(secretId));assert.match(r.res.headers.get('cache-control'),/no-store/);
r=await call('/api/me/space','PUT',{version:0,shelf:{id:secretId,name:'steal',books:[],visibility:'public'}},'bob');assert.equal(r.res.status,404);
r=await call('/api/profiles/'+id,'PUT',{version:2,shelf:{id:secretId,visibility:'public'}},'bob');assert.equal(r.res.status,405);
r=await call('/api/me/space','PUT',{version:2,shelf:{id:secretId,name:'Shared',description:'Hello',books:['third-person'],visibility:'public'}},'alice');assert.equal(r.res.status,200);
r=await call('/api/profiles/'+id);assert.equal(r.data.shelves.length,1);assert.equal(r.data.shelves[0].visibility,'public');
r=await call('/api/me/space','PUT',{version:3,shelf:{id:secretId,name:'Private again',books:['third-person'],visibility:'private'}},'alice');assert.equal(r.res.status,200);
r=await call('/api/profiles/'+id);assert.equal(r.data.shelves.length,0,'No stale public copy after privacy change');
r=await call('/api/me/space','PUT',{version:3,profile:{name:'stale'}},'alice');assert.equal(r.res.status,409);
r=await call('/api/me/space','PUT',{version:4,profile:{name:'X',avatar:'data:image/svg+xml;base64,AAAA'}},'alice');assert.equal(r.res.status,400);
r=await call('/api/me/space','PUT',{version:4,shelf:{name:'bad',books:['private-secret'],visibility:'public'}},'alice');assert.equal(r.res.status,400);
r=await call('/api/me/space','PUT',{version:4,deleteShelf:secretId},'alice');assert.equal(r.res.status,200);assert.equal(r.data.shelves.length,0);
const forbidden=await worker.fetch(new Request('https://test/api/me/space',{headers:{authorization:'Bearer '+token('alice',true)}}),env,{});assert.equal(forbidden.status,401);
const missing=await worker.fetch(new Request('https://test/api/me/space',{headers:{authorization:'Bearer '+token('alice')}}),{SESSION_SECRET:env.SESSION_SECRET},{});assert.equal(missing.status,503);
// Rating ownership and withdrawal through the real worker.
r=await call('/api/rate','POST',{slug:'third-person',rating:5,vid:'alice-device'},'alice');assert.equal(r.data.ratingCount,1);
r=await call('/api/rate/me','POST',{slug:'third-person',vid:'alice-device'},'alice');assert.equal(r.data.rating,5);
r=await call('/api/rate/me','POST',{slug:'third-person',vid:'alice-device'},'bob');assert.equal(r.data.rating,0,'Signed-in Bob cannot read Alice rating using her device id');
r=await call('/api/rate','POST',{slug:'third-person',rating:0,vid:'bob-device'},'bob');assert.equal(r.data.ratingCount,1,'Bob cannot withdraw Alice rating');
r=await call('/api/rate','POST',{slug:'third-person',rating:0,vid:'alice-device'},'alice');assert.equal(r.data.ratingCount,0);assert.equal(r.data.ratingAvg,0);
r=await call('/api/rate/me','POST',{slug:'third-person',vid:'alice-device'},'alice');assert.equal(r.data.rating,0);
console.log('Member Spaces: real Worker auth, cross-user isolation, private/public switching, no-store, version conflicts, avatar validation, delete, fail-closed and own-rating withdrawal passed');
