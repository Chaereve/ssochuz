/* Run the actual D1 migration against Python's built-in SQLite, then verify the
   trigger-maintained aggregates/constraints rather than only testing a mock. */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const py = String.raw`
import sqlite3, sys
from pathlib import Path
sql = Path(sys.argv[1]).read_text(encoding='utf-8')
db = sqlite3.connect(':memory:')
db.executescript(sql)
# Toggle-on, toggle-off, on again; trigger keeps the denormalized aggregate exact.
db.execute("INSERT INTO community_reactions VALUES (?, ?, ?, ?, 1, unixepoch(), unixepoch())", ('story-a', 1, 'u1', 'sso-love-it'))
assert db.execute("SELECT total FROM community_reaction_totals WHERE story_id='story-a'").fetchone()[0] == 1
db.execute("UPDATE community_reactions SET active=0, updated_at=unixepoch() WHERE story_id='story-a' AND user_id='u1'")
assert db.execute("SELECT total FROM community_reaction_totals WHERE story_id='story-a'").fetchone()[0] == 0
db.execute("UPDATE community_reactions SET active=1, updated_at=unixepoch() WHERE story_id='story-a' AND user_id='u1'")
assert db.execute("SELECT total FROM community_reaction_totals WHERE story_id='story-a'").fetchone()[0] == 1
# Deleting an active row decrements; deleting again is a no-op.
db.execute("DELETE FROM community_reactions WHERE story_id='story-a' AND user_id='u1'")
assert db.execute("SELECT total FROM community_reaction_totals WHERE story_id='story-a'").fetchone()[0] == 0
try:
    db.execute("INSERT INTO community_reactions VALUES (?, ?, ?, ?, 1, unixepoch(), unixepoch())", ('story-a', 1, 'u1', 'not-allowlisted'))
    raise AssertionError('unknown sticker ID was accepted by the schema')
except sqlite3.IntegrityError:
    pass
# UNIQUE(story,user,day) makes the one-brick-per-day contract atomic.
day = '2026-10-12'
db.execute("INSERT INTO community_bricks (story_id,user_id,day_utc,created_at) VALUES (?,?,?,unixepoch())", ('story-a','u1',day))
assert db.execute("SELECT total FROM community_brick_totals WHERE story_id='story-a'").fetchone()[0] == 1
try:
    db.execute("INSERT INTO community_bricks (story_id,user_id,day_utc,created_at) VALUES (?,?,?,unixepoch())", ('story-a','u1',day))
    raise AssertionError('same user/story/day duplicate was accepted')
except sqlite3.IntegrityError:
    pass
db.execute("INSERT INTO community_bricks (story_id,user_id,day_utc,created_at) VALUES (?,?,?,unixepoch())", ('story-a','u1','2026-10-13'))
assert db.execute("SELECT total FROM community_brick_totals WHERE story_id='story-a'").fetchone()[0] == 2
db.execute("DELETE FROM community_bricks WHERE story_id='story-a' AND day_utc='2026-10-13'")
assert db.execute("SELECT total FROM community_brick_totals WHERE story_id='story-a'").fetchone()[0] == 1
assert all(value >= 0 for (value,) in db.execute('SELECT total FROM community_reaction_totals UNION ALL SELECT total FROM community_brick_totals'))
print('SQLite migration/triggers/constraints OK')
`;
const result = spawnSync('python3', ['-c', py, path.join(root, 'worker/migrations/0001_community.sql')], { encoding: 'utf8' });
if (result.status !== 0) {
  console.error(result.stdout || '');
  console.error(result.stderr || 'python3/sqlite3 failed');
  process.exit(result.status || 1);
}
console.log(JSON.stringify({ errors0: [], migration: result.stdout.trim() }));
