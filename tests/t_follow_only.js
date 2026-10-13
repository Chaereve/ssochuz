const {JSDOM} = require('jsdom');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
  const dom = new JSDOM('<body data-personal-follow-only></body>', {url:'https://test.invalid/', runScripts: 'dangerously'});
  const w = dom.window;
  w.localStorage.setItem('ssochuz-prog-a', '4');
  w.localStorage.setItem('ssochuz:progress-cache:user-a', '[{"storyId":"a","chapterIndex":4}]');
  const before = w.localStorage.getItem('ssochuz:progress-cache:user-a');
  let listener;
  const client = {auth: {getSession: async () => ({data:{session:{user:{id:'user-a'},access_token:'test'}}})},
    from(table) {assert.equal(table, 'story_follows', 'header-only must not read or write progress');
      return {select: () => Promise.resolve({data:[{story_id:'a',last_seen_chapter_index:4}]})};
    }};
  w.CZ = {findLib: () => ({chapters:6})};
  w.CZ_AUTH = {current: () => ({uid:'user-a'}), state: () => 'in', getClient: async () => client,
    onAuth: fn => {listener=fn;}};
  w.eval(fs.readFileSync('src/cz-personal.js','utf8'));
  if (listener) listener({uid:'user-a'});
  await w.CZFollowPersonal.whenReady();
  assert.equal(w.CZPersonal, undefined, 'do not override existing device history');
  assert.equal(w.CZFollowPersonal.mode(), 'server');
  assert.equal(w.CZFollowPersonal.isFollowing('a'), true);
  assert.equal(w.CZFollowPersonal.newChapters('a',6), 2);
  assert.equal(w.localStorage.getItem('ssochuz-prog-a'), '4');
  assert.equal(w.localStorage.getItem('ssochuz:progress-cache:user-a'), before);
  dom.window.close();
  console.log(JSON.stringify({errors0:[],checked:'header-only account follows preserve history and progress cache'}));
})().catch(e=>{console.error(e);process.exit(1);});
