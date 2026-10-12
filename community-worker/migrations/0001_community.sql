-- Ssochuz community actions. Individual action rows are source of truth;
-- summary tables are maintained atomically by SQLite triggers so requests never
-- scan action history. All counts are constrained to remain non-negative.

CREATE TABLE IF NOT EXISTS community_reactions (
  story_id TEXT NOT NULL,
  chapter_index INTEGER NOT NULL CHECK (chapter_index BETWEEN 1 AND 100000),
  user_id TEXT NOT NULL,
  sticker_id TEXT NOT NULL CHECK (sticker_id IN (
    'sso-brick', 'sso-love-it', 'sso-cry-flood', 'sso-plot-twist',
    'sso-popcorn-spy', 'sso-more', 'sso-crown-chaos', 'sso-fighting',
    'sso-flattened', 'sso-no-sleep', 'sso-rage-roomba',
    'sso-secondhand-shame', 'sso-sugar-overload', 'sso-witness-protection'
  )),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (story_id, chapter_index, user_id, sticker_id)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS community_reaction_totals (
  story_id TEXT NOT NULL,
  chapter_index INTEGER NOT NULL CHECK (chapter_index BETWEEN 1 AND 100000),
  sticker_id TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 0 CHECK (total >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (story_id, chapter_index, sticker_id)
) WITHOUT ROWID;

CREATE TRIGGER IF NOT EXISTS community_reactions_after_insert
AFTER INSERT ON community_reactions
WHEN NEW.active = 1
BEGIN
  INSERT INTO community_reaction_totals (story_id, chapter_index, sticker_id, total, updated_at)
  VALUES (NEW.story_id, NEW.chapter_index, NEW.sticker_id, 1, NEW.updated_at)
  ON CONFLICT (story_id, chapter_index, sticker_id) DO UPDATE SET
    total = community_reaction_totals.total + 1,
    updated_at = NEW.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS community_reactions_after_toggle
AFTER UPDATE OF active ON community_reactions
WHEN OLD.active <> NEW.active
BEGIN
  INSERT INTO community_reaction_totals (story_id, chapter_index, sticker_id, total, updated_at)
  VALUES (
    NEW.story_id, NEW.chapter_index, NEW.sticker_id,
    MAX(0, NEW.active - OLD.active), NEW.updated_at
  )
  ON CONFLICT (story_id, chapter_index, sticker_id) DO UPDATE SET
    total = MAX(0, community_reaction_totals.total + NEW.active - OLD.active),
    updated_at = NEW.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS community_reactions_after_delete
AFTER DELETE ON community_reactions
WHEN OLD.active = 1
BEGIN
  UPDATE community_reaction_totals
  SET total = MAX(0, total - 1), updated_at = unixepoch()
  WHERE story_id = OLD.story_id AND chapter_index = OLD.chapter_index AND sticker_id = OLD.sticker_id;
END;

CREATE TABLE IF NOT EXISTS community_bricks (
  story_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  day_utc TEXT NOT NULL,
  sticker_id TEXT NOT NULL DEFAULT 'sso-brick' CHECK (sticker_id = 'sso-brick'),
  created_at INTEGER NOT NULL,
  UNIQUE (story_id, user_id, day_utc)
);

CREATE INDEX IF NOT EXISTS community_bricks_story_day
  ON community_bricks (story_id, day_utc);

CREATE TABLE IF NOT EXISTS community_brick_totals (
  story_id TEXT PRIMARY KEY,
  total INTEGER NOT NULL DEFAULT 0 CHECK (total >= 0),
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;

CREATE TRIGGER IF NOT EXISTS community_bricks_after_insert
AFTER INSERT ON community_bricks
BEGIN
  INSERT INTO community_brick_totals (story_id, total, updated_at)
  VALUES (NEW.story_id, 1, NEW.created_at)
  ON CONFLICT (story_id) DO UPDATE SET
    total = community_brick_totals.total + 1,
    updated_at = NEW.created_at;
END;

CREATE TRIGGER IF NOT EXISTS community_bricks_after_delete
AFTER DELETE ON community_bricks
BEGIN
  UPDATE community_brick_totals
  SET total = MAX(0, total - 1), updated_at = unixepoch()
  WHERE story_id = OLD.story_id;
END;
