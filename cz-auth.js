/* chuseoz · AUTH GOOGLE ONE-TOUCH (placeholder, local fallback) */
(function(w,d){
  'use strict';
  var LS_USER='chuseoz-user';
  var LS_TOKEN='chuseoz-auth-token';
  var user=null;
  var listeners=[];

  function loadUser(){
    try{
      var raw=localStorage.getItem(LS_USER);
      if(raw) user=JSON.parse(raw);
    }catch(e){ user=null; }
    return user;
  }
  function saveUser(u){
    user=u;
    try{
      if(u) localStorage.setItem(LS_USER, JSON.stringify(u));
      else localStorage.removeItem(LS_USER);
    }catch(e){}
    listeners.forEach(function(fn){ try{fn(u);}catch(e){} });
  }
  function onAuth(fn){ listeners.push(fn); if(user) fn(user); }

  // Firebase compat loader (optional)
  var fbApp=null, fbAuth=null;
  function fbConfig(){
    return w.CZ_FIREBASE_CONFIG || null;
  }
  function initFirebase(){
    var cfg=fbConfig();
    if(!cfg || !cfg.apiKey) return null;
    try{
      if(!w.firebase) return null;
      if(!firebase.apps || !firebase.apps.length){
        fbApp=firebase.initializeApp(cfg);
      } else fbApp=firebase.apps[0];
      fbAuth=firebase.auth();
      fbAuth.onAuthStateChanged(function(fu){
        if(fu){
          var u={ uid: fu.uid, email: fu.email, name: fu.displayName || fu.email, photo: fu.photoURL, provider:'google' };
          saveUser(u);
        } else {
          // keep local user if no firebase? clear only if firebase was source
          if(user && user.provider==='google') saveUser(null);
        }
      });
      return fbAuth;
    }catch(e){ console.warn('[auth] firebase init fail', e); return null; }
  }

  function loginGoogle(){
    var cfg=fbConfig();
    if(cfg && cfg.apiKey && w.firebase && firebase.auth){
      var auth=initFirebase() || fbAuth;
      if(!auth){
        CZ.toast('Chưa cấu hình Firebase Auth — đang dùng chế độ local tạm', 'info');
        // fallback local mock
        var mock={ uid:'local-'+Date.now(), email:'ban@chuseoz.local', name:'Bạn đọc', photo:'', provider:'local' };
        saveUser(mock);
        return Promise.resolve(mock);
      }
      var provider=new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt:'select_account' });
      return auth.signInWithPopup(provider).then(function(res){
        var fu=res.user;
        var u={ uid: fu.uid, email: fu.email, name: fu.displayName || fu.email, photo: fu.photoURL, provider:'google' };
        saveUser(u);
        CZ.toast('Đăng nhập: '+u.name, 'ok');
        return u;
      }).catch(function(e){
        CZ.toast('Đăng nhập lỗi: '+(e.message||e), 'err');
        throw e;
      });
    } else {
      // No firebase config -> local mock login (for non-profit low cost)
      var mock={ uid:'local-'+Date.now(), email:'ban@chuseoz.local', name:'Bạn đọc', photo:'', provider:'local' };
      saveUser(mock);
      CZ.toast('Chế độ local: đã lưu tên Bạn đọc trong máy (chưa có Firebase config)', 'info');
      return Promise.resolve(mock);
    }
  }
  function logout(){
    var cfg=fbConfig();
    if(cfg && cfg.apiKey && fbAuth){
      return fbAuth.signOut().then(function(){ saveUser(null); CZ.toast('Đã đăng xuất'); }).catch(function(){ saveUser(null); });
    } else {
      saveUser(null);
      CZ.toast('Đã đăng xuất (local)');
      return Promise.resolve();
    }
  }
  function current(){ return user; }

  // Cloud sync placeholder (progress/shelf)
  function syncToCloud(){
    if(!user) return Promise.resolve();
    // If Firebase Firestore available and user is google, we could sync
    // For now just toast
    if(user.provider==='local'){
      return Promise.resolve();
    }
    // TODO: implement Firestore sync when CZ_API supports /api/user/sync
    return Promise.resolve();
  }

  loadUser();

  w.CZ_AUTH={
    loginGoogle: loginGoogle,
    logout: logout,
    current: current,
    onAuth: onAuth,
    sync: syncToCloud,
    initFirebase: initFirebase
  };

  // Auto init firebase if SDK already loaded
  if(d.readyState==='loading') d.addEventListener('DOMContentLoaded', initFirebase);
  else initFirebase();
})(window, document);
