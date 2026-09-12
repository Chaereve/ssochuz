/* ======================================================================
   chuseoz admin — bản Cloudflare KV (2026-09-12)
   - KHÔNG còn GitHub Contents API (mỗi lần lưu = 1 commit + build + deploy).
   - Bấm Lưu -> PUT thẳng lên Worker -> KV -> người đọc thấy ngay.
   - Vẫn có: danh sách, sửa truyện, sửa chương, truyện mới, cài đặt,
     sao lưu/phục hồi, đồng bộ Blogger, nạp dữ liệu lên KV.
   ====================================================================== */
(function(){
'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const LS={api:'cz_kv_api',key:'cz_kv_key',reg:'cz_admin_reg',time:'cz_kv_time'};
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let API='',KEY='',REG=null,BOOK=null,CUR=null,BOOKS={},dirty=false,bookDirty=false,listNewFirst=true;

/* ---------------- tiện ích ---------------- */
function msg(t,isErr){const m=$('#msg');m.textContent=t||'';m.className='msg'+(isErr?' err':'');m.style.display=t?'block':'none';}
function msgLogin(t,isErr){const m=$('#msgLogin');if(!m)return;m.textContent=t||'';m.className='msg'+(isErr?' err':'');m.style.display=t?'block':'none';}
function badge(id,txt,cls){
  const sel=String(id).replace(/^[.#]/,'');
  const b=document.getElementById(sel); if(!b) return;
  b.className='badge'+(cls?' '+cls:'');
  const t=document.getElementById(sel+'Txt'); if(t) t.textContent=txt;
}
function normBase(u){return String(u||'').trim().replace(/\/+$/,'');}
function apiURL(path){return API+path;}
function fnum(n){return (n||0).toLocaleString('vi-VN');}
function slugify(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/đ/g,'d').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');}
function today(){return new Date().toISOString().slice(0,10);}

/* ---------------- gọi Worker ---------------- */
async function call(path,{method='GET',body=null,auth=false}={}){
  const opt={method,headers:{}};
  if(body!=null){opt.headers['content-type']='application/json';opt.body=JSON.stringify(body);}
  if(auth){ if(!KEY) throw new Error('Thiếu ADMIN_KEY'); opt.headers['x-admin-key']=KEY; }
  const r=await fetch(apiURL(path),opt);
  let d=null; try{ d=await r.json(); }catch(e){}
  if(!r.ok||(d&&d.ok===false)){ throw new Error((d&&d.error)||('HTTP '+r.status)); }
  return d;
}
async function health(){ return call('/api/health'); }

/* ---------------- trạng thái KV ---------------- */
async function refreshStatus(){
  if(!API){ badge('#kvBadge','chưa cấu hình Worker','warn'); $('#kvInfo').innerHTML=''; return false; }
  try{
    const h=await health();
    const has=(h.kv&&(h.kv.registry===true||h.kv.registry==='true'))||h.registry===true||h.hasRegistry===true;
    badge('#kvBadge', has? 'KV đã có dữ liệu' : 'KV trống — hãy nạp dữ liệu', has?'ok':'warn');
    $('#kvInfo').innerHTML=[
      ['Worker',esc(API)],['KV namespace',esc(h.kvName||h.namespace||'CZ_KV')],
      ['Dữ liệu registry',has?'có':'chưa có'],['Số bộ trong KV',h.books!=null?fnum(h.books):'—'],
      ['Lần ghi gần nhất',esc(h.saved||'—')]
    ].map(([k,v])=>`<b>${k}</b><span>${v}</span>`).join('');
    return true;
  }catch(e){
    badge('#kvBadge','không kết nối được Worker','err');
    $('#kvInfo').innerHTML=`<b>Lỗi</b><span>${esc(e.message)}</span>`;
    return false;
  }
}

/* ---------------- đăng nhập ---------------- */
async function login(){
  API=normBase($('#inApi').value);
  KEY=$('#inKey').value.trim();
  msgLogin('');
  if(!API){ msgLogin('Nhập URL Worker đã.',true); return; }
  if(!/^https?:\/\//.test(API)) API='https://'+API;
  if(!KEY){ msgLogin('Nhập ADMIN_KEY đã.',true); return; }
  const btn=$('#btnLogin'); btn.disabled=true; btn.textContent='Đang kiểm tra…';
  try{
    const h=await health();
    if(!h.ok) throw new Error(h.error||'Worker trả về lỗi');
    await call('/api/registry',{auth:true}).catch(e=>{ if(/401|sai|thiếu/i.test(e.message)) throw new Error('ADMIN_KEY không đúng.'); });
    localStorage.setItem(LS.api,API); localStorage.setItem(LS.key,KEY);
    enterDash(true);
  }catch(e){
    msgLogin('Không vào được: '+e.message,true);
  }finally{ btn.disabled=false; btn.textContent='Kiểm tra & vào quản trị'; }
}
function enterDash(askSeed){
  $('#secLogin').classList.add('hide'); $('#secDash').classList.remove('hide');
  $('#btnLogout').classList.remove('hide'); $('#btnReloadCh').classList.remove('hide');
  badge('#chBadge','đang kết nối…','warn');
  refreshStatus().then(ok=>{
    if(ok) badge('#chBadge','đang đăng lên KV','ok');
    loadRegistry().then(()=>{ if(askSeed && REG && (!REG.lib||!REG.lib.length)) msg('KV chưa có truyện nào — bấm “↑ Nạp dữ liệu lên KV”.'); });
  });
}
function logout(){
  localStorage.removeItem(LS.key);
  $('#secLogin').classList.remove('hide'); $('#secDash').classList.add('hide');
  $('#btnLogout').classList.add('hide'); $('#btnReloadCh').classList.add('hide');
  badge('#chBadge','chưa kết nối');
}
$('#btnLogin').addEventListener('click',login);
$('#btnLogout').addEventListener('click',logout);
$('#btnReloadCh').addEventListener('click',()=>location.reload());
$('#btnTpl').addEventListener('click',()=>$('#tplBox').classList.toggle('hide'));
$('#inKey').addEventListener('keydown',e=>{if(e.key==='Enter')login();});
$('#inApi').addEventListener('keydown',e=>{if(e.key==='Enter')login();});

/* ---------------- nạp registry (KV, fallback file tĩnh) ---------------- */
async function loadRegistry(){
  try{
    if(API&&KEY){
      try{
        const reg=await call('/api/registry');
        if(reg&&reg.lib){ REG=reg; badge('#chBadge','đang đăng lên KV','ok'); }
      }catch(e){ badge('#chBadge','KV lỗi: '+e.message,'err'); }
    }
    if(!REG){
      REG=await fetch('/data/registry.json',{cache:'no-store'}).then(r=>r.ok?r.json():null);
      localStorage.setItem(LS.reg,JSON.stringify(REG));
      if(REG) badge('#chBadge','xem bản tĩnh trong repo','warn');
    }
    if(!REG) throw new Error('không có registry');
    try{ localStorage.setItem(LS.reg,JSON.stringify(REG)); }catch(e){}
    renderList();
  }catch(e){ msg('Không tải được dữ liệu: '+e.message,true); }
}

/* ---------------- danh sách ---------------- */
function libSorted(){
  const q=$('#q').value.trim().toLowerCase();
  let arr=(REG.lib||[]).slice();
  if(q) arr=arr.filter(n=>[n.title,n.author,n.couple,n.slug].join(' ').toLowerCase().includes(q));
  return arr.sort((a,b)=>String(a.title||'').localeCompare(String(b.title||''),'vi'));
}
function renderList(){
  const arr=libSorted();
  $('#tb').innerHTML=arr.map((n,i)=>`<tr data-slug="${esc(n.slug)}" class="${n.__dirty?'dirtyrow':''}">
    <td>${i+1}</td>
    <td><b>${esc(n.title)}</b><div class="sm">${esc(n.slug)}</div></td>
    <td>${esc(n.countLabel||n.chapters||'')}</td>
    <td><span class="pill">${esc(n.status||'')}</span></td>
    <td class="sm">${esc(n.updated||'')}</td>
    <td><button class="sm2" data-edit="${esc(n.slug)}">Sửa</button></td></tr>`).join('')
    || '<tr><td colspan="6" class="sm">Không có truyện nào khớp.</td></tr>';
  $('#tb').querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>openEdit(b.dataset.edit)));
  $('#tb').querySelectorAll('tr[data-slug]').forEach(tr=>tr.addEventListener('click',e=>{
    if(!e.target.closest('button')) openEdit(tr.dataset.slug);}));
}
$('#q').addEventListener('input',renderList);
$('#btnRefresh').addEventListener('click',async()=>{
  badge('#chBadge','đang tải lại…','warn');
  await loadRegistry(); await refreshStatus(); msg('Đã tải lại dữ liệu lúc '+new Date().toLocaleTimeString('vi-VN'));
});

/* ---------------- tab ---------------- */
const PANES=[['#tabList','#paneList'],['#tabNew','#paneNew'],['#tabSet','#paneSet'],['#tabHelp','#paneHelp']];
function tab(which){                                   /* which: '#tabList' … */
  if(!which){ Object.values(PANES).forEach(p=>$(p[1]).classList.add('hide')); }
  else{
    PANES.forEach(([b,p])=>{ $(b).classList.toggle('on',b===which); $(p).classList.toggle('hide',b!==which); });
  }
  if(which!=='#paneEdit') $('#paneEdit').classList.add('hide');
}
PANES.forEach(([b])=>$(b).addEventListener('click',()=>tab(b)));
$('#btnBackList').addEventListener('click',()=>tab('#tabList'));

/* ---------------- sửa truyện ---------------- */
async function loadBook(slug,force){
  if(!force&&BOOKS[slug]) return BOOKS[slug];
  try{ BOOK=await call('/api/book/'+encodeURIComponent(slug)); }
  catch(e){ BOOK=null; }
  if(!BOOK){
    try{ BOOK=await fetch('/data/book/'+encodeURIComponent(slug)+'.json',{cache:'no-store'}).then(r=>r.ok?r.json():null); }catch(e){}
  }
  if(BOOK) BOOKS[slug]=BOOK;
  return BOOK;
}
async function openEdit(slug){
  CUR=(REG.lib||[]).find(n=>n.slug===slug); if(!CUR) return;
  tab('');                       /* đóng mọi pane + bỏ chọn tab */
  $('#paneEdit').classList.remove('hide');
  $('#edHead').textContent='Sửa: '+CUR.title;
  $('#fTitle').value=CUR.title||''; $('#fSlug').value=CUR.slug||''; $('#fAuthor').value=CUR.author||'';
  $('#fCouple').value=CUR.couple||''; $('#fYear').value=CUR.year||''; $('#fStatus').value=CUR.status||'Đang cập nhật';
  $('#fCount').value=CUR.countLabel||''; $('#f18').value=CUR.is18?'1':'0';
  $('#fAdapt').value=CUR.adapt||''; $('#fAdaptName').value=CUR.adaptName||'';
  $('#fThumb').value=CUR.slide||CUR.thumb||''; $('#fSyn').value=CUR.synFull||CUR.syn||'';
  $('#fBlog').value=CUR.blog||''; $('#fPostId').value=CUR.postId||''; $('#fUpd').value=CUR.updated||today();
  dirty=false;$('#dirtyMeta').textContent='';
  const b=await loadBook(slug);
  $('#chCount').textContent=b&&b.chapters?b.chapters.length:0;
  renderChapters(); msg('');
  window.scrollTo({top:0,behavior:'smooth'});
}
$$('#paneEdit input,#paneEdit select,#paneEdit textarea').forEach(el=>{
  el.addEventListener('input',()=>{dirty=true;$('#dirtyMeta').textContent='● có thay đổi chưa lưu';});
});
/* danh sách chương: MỚI NHẤT Ở TRÊN (giống blogspot) */
function renderChapters(){
  const box=$('#chList'), ch=(BOOK&&BOOK.chapters)||[];
  if(!ch.length){ box.innerHTML='<div class="sm" style="padding:10px">Chưa có chương — bấm “+ Thêm chương cuối”.</div>'; CURCH=-1; return; }
  const order=ch.map((c,i)=>i).reverse();          /* đảo: chương cuối lên đầu */
  box.innerHTML=order.map((i,pos)=>{
    const c=ch[i], last=pos===0;
    return `<div data-i="${i}" class="${i===CURCH?'on':''}">
      <span class="n">${i+1}</span>
      <span style="flex:1">${esc(c.t||('Chương '+(i+1)))}${last?' <span class="pill">mới nhất</span>':''}</span>
      <span class="mv" data-up="${i}" title="Đưa lên">↑</span>
      <span class="mv" data-dn="${i}" title="Đưa xuống">↓</span>
    </div>`;}).join('');
  box.querySelectorAll('div[data-i]').forEach(d=>d.addEventListener('click',e=>{
    if(e.target.closest('.mv')) return; openChapter(+d.dataset.i);}));
  box.querySelectorAll('[data-up]').forEach(b=>b.addEventListener('click',()=>moveChapter(+b.dataset.up,-1)));
  box.querySelectorAll('[data-dn]').forEach(b=>b.addEventListener('click',()=>moveChapter(+b.dataset.dn,1)));
}
function moveChapter(i,dir){
  const ch=BOOK.chapters, j=i+dir;
  if(j<0||j>=ch.length) return;
  [ch[i],ch[j]]=[ch[j],ch[i]];
  bookDirty=true; renderChapters(); openChapter(j);
  dirty=true;$('#dirtyMeta').textContent='● có thay đổi chưa lưu';
}
function openChapter(i){
  const ch=(BOOK&&BOOK.chapters)||[];
  if(i<0||i>=ch.length) return;
  CURCH=i;
  $('#chEdHead').textContent='Nội dung chương '+(i+1)+(ch.length===i+1?' (cuối)':'');
  $('#chTitle').value=ch[i].t||''; $('#chHtml').value=ch[i].html||'';
  renderChapters();
}
let CURCH=-1;
$('#btnChAdd').addEventListener('click',()=>{
  if(!BOOK)return; BOOK.chapters=BOOK.chapters||[];
  const n=BOOK.chapters.length+1;
  BOOK.chapters.push({t:'Chương '+n,html:''});
  bookDirty=true; dirty=true;$('#dirtyMeta').textContent='● có thay đổi chưa lưu';
  $('#chCount').textContent=BOOK.chapters.length; openChapter(BOOK.chapters.length-1);
});
function pasteChapters(raw){
  const parts=raw.split(/^\s*---CHAP---\s*$/m).map(s=>s.trim()).filter(Boolean);
  const add=parts.map((p,i)=>{
    const lines=p.split(/\n+/);
    let t='Chương '+(BOOK.chapters.length+i+1);
    if(/^(chương|chap|chapter)\b/i.test(lines[0].trim())&&lines[0].trim().length<90) t=lines.shift().trim();
    const html=lines.map(x=>x.trim()).filter(Boolean).map(x=>'<p>'+x.replace(/[<>]/g,'')+'</p>').join('');
    return {t,html};
  });
  BOOK.chapters=BOOK.chapters.concat(add); bookDirty=true; dirty=true;
  $('#chCount').textContent=BOOK.chapters.length;$('#dirtyMeta').textContent='● có thay đổi chưa lưu';
  renderChapters(); msg('Đã thêm '+add.length+' chương — nhớ bấm Lưu truyện + chương.');
}
$('#btnChPaste').addEventListener('click',()=>{
  const raw=prompt('Dán nội dung. Mỗi chương ngăn bởi dòng chỉ chứa ---CHAP---\nDòng đầu mỗi chương có thể là tựa chương.');
  if(raw&&raw.trim()) pasteChapters(raw);
});
$('#btnChText2Html').addEventListener('click',()=>{
  const t=$('#chHtml').value.split(/\n{2,}/).map(x=>x.trim()).filter(Boolean)
    .map(x=>'<p>'+x.replace(/\n/g,' ').replace(/[<>]/g,'')+'</p>').join('\n');
  $('#chHtml').value=t; dirty=true;$('#dirtyMeta').textContent='● có thay đổi chưa lưu';
});
$('#btnChDel').addEventListener('click',()=>{
  if(!BOOK||CURCH<0) return;
  if(!confirm('Xoá chương '+(CURCH+1)+'?')) return;
  BOOK.chapters.splice(CURCH,1); BOOK.chapters.forEach((c,i)=>{if(/^Chương \d+$/.test(c.t))c.t='Chương '+(i+1);});
  bookDirty=true;dirty=true;$('#chCount').textContent=BOOK.chapters.length;
  CURCH=Math.min(CURCH,BOOK.chapters.length-1);renderChapters();if(CURCH>=0)openChapter(CURCH);
  $('#dirtyMeta').textContent='● có thay đổi chưa lưu';
});
$('#chTitle').addEventListener('input',()=>{
  if(BOOK&&CURCH>=0){BOOK.chapters[CURCH].t=$('#chTitle').value;bookDirty=true;dirty=true;
    const box=$('#chList');const d=box.querySelector(`div[data-i="${CURCH}"] span:nth-child(2)`);
    if(d)d.textContent=$('#chTitle').value;
    $('#chList').querySelector(`div[data-i="${CURCH}"] .n`).textContent=CURCH+1;
    $('#dirtyMeta').textContent='● có thay đổi chưa lưu';}
});
$('#chHtml').addEventListener('input',()=>{
  if(BOOK&&CURCH>=0){BOOK.chapters[CURCH].html=$('#chHtml').value;bookDirty=true;dirty=true;
    $('#dirtyMeta').textContent='● có thay đổi chưa lưu';}
});

/* ---------- lưu metadata truyện ---------- */
$('#btnSaveMeta').addEventListener('click',async()=>{
  if(!CUR) return;
  const oldSlug=CUR.slug, newSlug=slugify($('#fSlug').value)||oldSlug;
  Object.assign(CUR,{
    title:$('#fTitle').value.trim(),slug:newSlug,author:$('#fAuthor').value.trim(),
    couple:$('#fCouple').value.trim(),year:$('#fYear').value.trim(),status:$('#fStatus').value,
    countLabel:$('#fCount').value.trim(),is18:$('#f18').value==='1',
    adapt:$('#fAdapt').value,adaptName:$('#fAdaptName').value.trim(),
    slide:$('#fThumb').value.trim(),thumb:$('#fThumb').value.trim(),
    synFull:$('#fSyn').value.trim(),syn:$('#fSyn').value.trim().slice(0,220),
    blog:$('#fBlog').value.trim(),postId:$('#fPostId').value.trim(),updated:$('#fUpd').value.trim()||today()
  });
  if(oldSlug!==newSlug){
    const b=BOOKS[oldSlug]; if(b){ BOOKS[newSlug]=b; delete BOOKS[oldSlug]; }
    msg('Đã đổi slug: '+oldSlug+' → '+newSlug+' (url cũ 404)',false);
  }
  await saveRegistry('Đã lưu thông tin truyện lên KV');
  renderList();
});
async function saveRegistry(okMsg){
  if(!REG) return;
  REG.rev=new Date().toISOString().slice(0,16).replace('T',' ');
  REG.source=Object.assign({},REG.source,{synced:new Date().toISOString()});
  try{
    const r=await call('/api/registry',{method:'PUT',auth:true,body:REG});
    dirty=false;$('#dirtyMeta').textContent=''; msg(okMsg+' · '+new Date().toLocaleTimeString('vi-VN')+' · rev '+(r.rev||REG.rev));
    refreshStatus();
  }catch(e){ msg('Lưu registry thất bại: '+e.message,true); }
}
/* ---------- lưu cả truyện (chương) ---------- */
$('#btnSaveBook').addEventListener('click',async()=>{
  if(!BOOK||!CUR) return;
  BOOK.slug=CUR.slug; BOOK.title=CUR.title;
  try{
    await call('/api/book/'+encodeURIComponent(CUR.slug),{method:'PUT',auth:true,body:BOOK});
    bookDirty=false; msg('Đã lưu '+BOOK.chapters.length+' chương lên KV lúc '+new Date().toLocaleTimeString('vi-VN'));
    if(dirty) await saveRegistry('Đã lưu thông tin truyện');
  }catch(e){ msg('Lưu chương thất bại: '+e.message,true); }
});

/* ---------- truyện mới ---------- */
$('#nTitle').addEventListener('input',()=>{ if(!$('#nSlug').dataset.touched) $('#nSlug').value=slugify($('#nTitle').value); });
$('#nSlug').addEventListener('input',e=>{e.target.dataset.touched='1';});
$('#btnNew').addEventListener('click',async()=>{
  const title=$('#nTitle').value.trim(); if(!title){ msg('Nhập tên truyện đã.',true); return; }
  const slug=slugify($('#nSlug').value||title);
  if((REG.lib||[]).some(n=>n.slug===slug)){ msg('Slug đã tồn tại.',true); return; }
  const raw=$('#nChap').value.trim();
  const chapters=raw? raw.split(/\n{2,}/).map((p,i)=>({t:'Chương '+(i+1),html:'<p>'+p.replace(/\n/g,' ').replace(/[<>]/g,'')+'</p>'})):[];
  const entry={title,slug,author:$('#nAuthor').value.trim(),couple:$('#nCouple').value.trim(),
    year:$('#nYear').value.trim()||String(new Date().getFullYear()),status:$('#nStatus').value,
    countLabel:chapters.length?chapters.length+'/'+chapters.length:'0/—',is18:$('#n18').value==='1',
    adapt:$('#nAdapt').value||'',adaptName:$('#nAdaptName').value.trim(),
    thumb:$('#nThumb').value.trim(),slide:$('#nThumb').value.trim(),
    syn:$('#nSyn').value.trim().slice(0,220),synFull:$('#nSyn').value.trim(),
    chapters:chapters.length,url:'/truyen/'+slug+'/',blog:$('#nBlog').value.trim(),
    postId:'',updated:today()};
  try{
    if(chapters.length) await call('/api/book/'+encodeURIComponent(slug),{method:'PUT',auth:true,
      body:{title,slug,author:entry.author,chapters}});
    REG.lib=REG.lib||[]; REG.lib.push(entry);
    await saveRegistry('Đã tạo truyện "'+title+'" ('+chapters.length+' chương)');
    $('#nTitle').value=$('#nSlug').value=$('#nAuthor').value=$('#nCouple').value='';
    $('#nYear').value=$('#nThumb').value=$('#nSyn').value=$('#nChap').value=$('#nBlog').value='';
    renderList(); tab('#tabList');
  }catch(e){ msg('Tạo truyện thất bại: '+e.message,true); }
});

/* ---------- cài đặt ---------- */
$('#btnSaveSet').addEventListener('click',async()=>{
  REG.settings=Object.assign({},REG.settings,{giscus:{repo:$('#gRepo').value.trim(),repoId:$('#gRepoId').value.trim()}});
  await saveRegistry('Đã lưu cài đặt');
});

/* ---------- đồng bộ Blogger ---------- */
$('#btnSync').addEventListener('click',async()=>{
  if(!confirm('Đọc lại dữ liệu thật từ chuseoz.blogspot.com và ghi đè số chương/tình trạng/ngày cập nhật trong KV?')) return;
  const b=$('#btnSync'); b.disabled=true; const old=b.textContent; b.textContent='Đang đồng bộ…';
  try{
    const r=await call('/api/sync',{method:'POST',auth:true});
    msg('Đồng bộ xong: '+r.changes+' thay đổi · posts '+r.posts+' · pages '+r.pages+' · rev '+r.rev);
    await loadRegistry(); await refreshStatus();
  }catch(e){ msg('Đồng bộ thất bại: '+e.message,true); }
  finally{ b.disabled=false; b.textContent=old; }
});

/* ---------- nạp dữ liệu lên KV ---------- */
$('#btnSeed').addEventListener('click',async()=>{
  if(!confirm('Nạp TOÀN BỘ registry + 62 bộ truyện trong repo lên KV?\nViệc này ghi đè dữ liệu đang có trên KV.')) return;
  const b=$('#btnSeed'); b.disabled=true; const old=b.textContent;
  try{
    const reg=(REG&&REG.lib)?REG:await fetch('/data/registry.json',{cache:'no-store'}).then(r=>r.json());
    b.textContent='Đang nạp registry…';
    await call('/api/registry',{method:'PUT',auth:true,body:reg});
    const lib=reg.lib||[]; let done=0,failed=[];
    for(const n of lib){
      b.textContent=`Đang nạp ${done+1}/${lib.length}: ${n.title}`;
      try{
        const bk=await fetch('/data/book/'+encodeURIComponent(n.slug)+'.json',{cache:'no-store'}).then(r=>r.ok?r.json():null);
        if(!bk) continue;
        await call('/api/book/'+encodeURIComponent(n.slug),{method:'PUT',auth:true,body:bk});
        done++;
      }catch(e){ failed.push(n.slug); }
    }
    msg('Đã nạp '+done+'/'+lib.length+' bộ lên KV'+(failed.length?' · lỗi: '+failed.join(', '):''));
    REG=reg; renderList(); refreshStatus();
  }catch(e){ msg('Nạp thất bại: '+e.message,true); }
  finally{ b.disabled=false; b.textContent=old; }
});

/* ---------- sao lưu / phục hồi ---------- */
$('#btnBackup').addEventListener('click',async()=>{
  msg('Đang gom dữ liệu để sao lưu…');
  const dump={_: 'chuseoz-backup', at:new Date().toISOString(), registry:REG, books:{}};
  const lib=(REG.lib||[]);
  for(const n of lib){
    try{ const bk=await call('/api/book/'+encodeURIComponent(n.slug)); if(bk)dump.books[n.slug]=bk; }
    catch(e){ try{ const bk=await fetch('/data/book/'+encodeURIComponent(n.slug)+'.json').then(r=>r.ok?r.json():null); if(bk)dump.books[n.slug]=bk; }catch(_){} }
  }
  const blob=new Blob([JSON.stringify(dump)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download='chuseoz-backup-'+today()+'.json'; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),4000);
  msg('Đã tải bản sao lưu ('+Object.keys(dump.books).length+' bộ).');
});
$('#btnRestore').addEventListener('click',()=>$('#fileRestore').click());
$('#fileRestore').addEventListener('change',async e=>{
  const f=e.target.files[0]; if(!f) return;
  if(!confirm('Phục hồi từ file "'+f.name+'"? Dữ liệu trên KV sẽ bị ghi đè.')) return;
  try{
    const dump=JSON.parse(await f.text());
    if(dump.registry) await call('/api/registry',{method:'PUT',auth:true,body:dump.registry});
    const slugs=Object.keys(dump.books||{}); let i=0;
    for(const s of slugs){ msg(`Đang phục hồi ${++i}/${slugs.length}…`); await call('/api/book/'+encodeURIComponent(s),{method:'PUT',auth:true,body:dump.books[s]}); }
    REG=dump.registry; renderList(); msg('Phục hồi xong '+slugs.length+' bộ.');
    refreshStatus();
  }catch(err){ msg('Phục hồi lỗi: '+err.message,true); }
  e.target.value='';
});

/* ---------- cảnh báo khi rời trang còn thay đổi ---------- */
window.addEventListener('beforeunload',e=>{
  if(dirty||bookDirty){ e.preventDefault(); e.returnValue=''; }
});

/* ---------- khởi động ---------- */
(function boot(){
  const a=localStorage.getItem(LS.api),k=localStorage.getItem(LS.key);
  if(a)$('#inApi').value=a;
  try{ REG=JSON.parse(localStorage.getItem(LS.reg)||'null'); }catch(e){}
  if(a&&k){ API=normBase(a); KEY=k; enterDash(false); }
  else{ tab('#tabList'); }
  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key==='s'){ e.preventDefault();
      if(!$('#paneEdit').classList.contains('hide')) $('#btnSaveBook').click(); else if(REG) saveRegistry('Đã lưu'); }
  });
})();
})();
