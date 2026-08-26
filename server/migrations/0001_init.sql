-- Unidades do condomínio (catálogo fixo: 5 torres x 8 andares x 8 unidades = 320)
CREATE TABLE apartments (
  id TEXT PRIMARY KEY,
  tower INTEGER NOT NULL CHECK (tower BETWEEN 1 AND 5),
  floor INTEGER NOT NULL CHECK (floor BETWEEN 0 AND 7),
  unit_number INTEGER NOT NULL CHECK (unit_number BETWEEN 1 AND 8),
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  UNIQUE (tower, floor, unit_number)
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  apartment_id TEXT REFERENCES apartments(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'resident' CHECK (role IN ('resident', 'admin')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Só pode haver 1 morador por apartamento; admins não têm apartamento (apartment_id NULL, sem limite).
CREATE UNIQUE INDEX idx_users_apartment ON users(apartment_id) WHERE apartment_id IS NOT NULL;

CREATE TABLE topics (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'scheduled')),
  assembly_date TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_topics_status ON topics(status);

CREATE TABLE votes (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  value TEXT NOT NULL CHECK (value IN ('favor', 'contra')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (topic_id, user_id)
);

CREATE INDEX idx_votes_topic ON votes(topic_id);

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_comments_topic ON comments(topic_id);
