/* Personal home blocks + versioned guest follow/progress + async reader follow.
   Public TOCs are batched through one Worker endpoint; no per-story polling. */
const { page, dataFetch, ROOT } = require('./mk');
const fs = require('fs'), path = require('path');
const REG = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/registry.json'), 'utf8'));
const readBook = slug => JSON.parse(fs.readFileSync(path.join(ROOT, 'data/book', slug + '.json'), 'utf8'));
const BASE = 'https://cms.test';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const J = (body, ok = true, status = 200) => Promise.resolve({ ok, status, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) });
const bad = [];
const ok = (condition, label) => { if (!condition) bad.push(label); };

function makeApi(log) {
  return (route, options = {}) => {
    if (log) log.push({ route, options });
    if (route === '/api/registry') return J(REG);
    const bookMatch = route.match(/^\/api\/book\/([^/?]+)/);
    if (bookMatch) {
      try { return J(readBook(decodeURIComponent(bookMatch[1]))); }
      catch (_) { return J({ ok: false }, false, 404); }
    }
    if (route === '/api/schedule') return J({ items: [] });
    if (route === '/api/stats') return J({ ok: true, source: 'kv', fetchedAt: new Date().toISOString(), items: {} });
    if (route === '/api/community/tocs' && options.method === 'POST') {
      const ids = JSON.parse(options.body || '{}').storyIds || [];
      const items = ids.map(storyId => {
        const found = REG.lib.find(item => item.slug === storyId);
        let chapters = [];
        try { chapters = readBook(storyId).chapters || []; } catch (_) {}
        return found ? { storyId, chapterCount: chapters.length, updatedAt: found.updated || '',
          chapters: chapters.slice(-10).map((chapter, offset) => ({ index: chapters.length - Math.min(10, chapters.length) + offset + 1, title: chapter.t || '' })) } : null;
      }).filter(Boolean);
      return J({ ok: true, items });
    }
    return undefined;
  };
}
function supabaseStub(w) {
  w.supabase = { createClient() {
    return { auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    } };
  } };
}

(async () => {
  const log = [];
  const story = REG.lib.find(item => item && item.slug && item.status === 'Đang cập nhật' && fs.existsSync(path.join(ROOT, 'data/book', item.slug + '.json')));
  if (!story) throw new Error('fixture cần ít nhất một truyện đang cập nhật có book tĩnh');
  const chapterCount = readBook(story.slug).chapters.length;
  const stamp = new Date(Date.now() - 60_000).toISOString();
  const home = page('index.html', {
    url: 'https://ssochuz.pages.dev/', config: { CZ_API: BASE },
    fetch: dataFetch({ apiBase: BASE, api: makeApi(log), log: [] }),
    setup(w) {
      supabaseStub(w);
      w.matchMedia = query => ({ matches: /reduced-motion/.test(query), addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.localStorage.setItem('ssochuz:progress:v1', JSON.stringify([{
        storyId: story.slug, chapterId: 'ch-1', chapterIndex: Math.min(1, chapterCount || 1), scrollPercent: 42, updatedAt: stamp,
      }]));
      w.localStorage.setItem('ssochuz:follows:v1', JSON.stringify([{
        storyId: story.slug, lastSeenChapterIndex: 0, createdAt: stamp, lastSeenAt: stamp,
      }]));
      w.localStorage.setItem('ssochuz:dice:options:v1', JSON.stringify({ run: true, done: true, adult: true, genre: '' }));
    },
  });
  await wait(1300);
  const { win, doc } = home;
  const resume = doc.querySelector('#resumeSec'), updates = doc.querySelector('#followUpdatesSec');
  ok(resume && !resume.hidden, 'trang chủ phải có khối Đọc tiếp');
  ok(updates && !updates.hidden, 'trang chủ phải có khối truyện theo dõi có chương mới');
  ok(doc.querySelector('#resumeRail .personal-card a[href*="chuong-"]'), 'tiến độ phải hiện link Đọc tiếp tới chương đã lưu');
  ok(doc.querySelector('#resumeRail .personal-progress'), 'Đọc tiếp hiển thị % tiến độ scroll');
  const fresh = doc.querySelector('#followUpdatesRail .personal-card');
  ok(fresh && /chương mới/i.test(fresh.textContent), 'follow baseline cũ phải hiện số chương mới');
  const tocRequests = log.filter(row => row.route === '/api/community/tocs');
  ok(tocRequests.length <= 1 && tocRequests.every(row => JSON.parse(row.options.body).storyIds.length <= 20),
    'homepage gọi TOC theo batch, không phát sinh N+1 request');
  ok(!!doc.querySelector('[data-dice] .dicebtn'), 'random picker có nút trên trang chủ');
  const candidates = win.CZDice.candidates();
  ok(candidates.length > 0 && candidates.some(item => item.slug === story.slug), 'random picker ưu tiên truyện được theo dõi');
  const diceButton = doc.querySelector('[data-dice] .dicebtn');
  diceButton && diceButton.click();
  await wait(50);
  ok(!!doc.querySelector('#czDiceBox #dcSpin'), 'random picker mở vòng quay');
  const spin = doc.querySelector('#czDiceBox #dcSpin');
  spin && spin.click();
  await wait(70);
  ok(doc.querySelector('#czDiceBox #dcResult h4')?.textContent === story.title, 'vòng quay chốt truyện theo dõi khi chỉ còn một ứng viên ưu tiên');

  // Follow click in the story hero and in-reader control runs the shared async service.
  const reader = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/third-person/',
    config: { CZ_API: BASE },
    fetch: dataFetch({ apiBase: BASE, api: makeApi([]), log: [] }),
    setup: supabaseStub,
  });
  await wait(1300);
  const rwin = reader.win, rdoc = reader.doc;
  const storySlug = 'third-person';
  const hero = rdoc.querySelector('#shero [data-followbtn="' + storySlug + '"]');
  ok(hero && hero.getAttribute('aria-pressed') === 'false', 'story hero follow button exposes aria-pressed');
  hero && hero.dispatchEvent(new rwin.MouseEvent('click', { bubbles: true, cancelable: true }));
  await wait(80);
  let saved = JSON.parse(rwin.localStorage.getItem('ssochuz:follows:v1') || '[]');
  ok(saved.some(row => row.storyId === storySlug), 'follow action persists only into versioned guest data');
  ok(!rwin.localStorage.getItem('ssochuz-follow'), 'new follows are not written to legacy unversioned keys');
  ok(hero && hero.getAttribute('aria-pressed') === 'true', 'hero button updates after guest save succeeds');
  rwin.location.hash = '#chuong-1';
  await wait(350);
  const readerFollow = rdoc.querySelector('#actFollow');
  ok(readerFollow && readerFollow.getAttribute('aria-pressed') === 'true', 'reader button reflects the same follow state');
  if (readerFollow) {
    readerFollow.dispatchEvent(new rwin.MouseEvent('click', { bubbles: true, cancelable: true }));
    await wait(70);
  }
  saved = JSON.parse(rwin.localStorage.getItem('ssochuz:follows:v1') || '[]');
  ok(!saved.some(row => row.storyId === storySlug), 'reader follow control removes the same guest row');
  ok(reader.errors.length === 0, 'story follow test has no JavaScript errors: ' + reader.errors.slice(0, 3).join(' | '));
  ok(home.errors.length === 0, 'home personal UI has no JavaScript errors: ' + home.errors.slice(0, 3).join(' | '));

  console.log(JSON.stringify({ errors0: bad, story: story.slug, chapters: chapterCount, tocBatches: tocRequests.length,
    personalKeys: ['ssochuz:progress:v1', 'ssochuz:follows:v1'] }, null, 1));
  home.dom.window.close(); reader.dom.window.close();
  process.exit(bad.length ? 1 : 0);
})().catch(error => { console.error(error && error.stack || error); process.exit(1); });
