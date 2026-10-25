CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  username_lower TEXT NOT NULL UNIQUE,
  key_hash TEXT NOT NULL UNIQUE,
  timezone TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Every word a player has been given, scored or free. A word is dealt at most once per player.
CREATE TABLE games (
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('scored', 'free')),
  day INTEGER NOT NULL,
  word TEXT NOT NULL,
  number INTEGER,
  guesses TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'playing' CHECK (status IN ('playing', 'won', 'lost')),
  hard INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, word)
);

-- At most one scored game per category per local day.
CREATE UNIQUE INDEX games_scored_day ON games (user_id, category, day) WHERE mode = 'scored';
CREATE INDEX games_user_category ON games (user_id, category);
