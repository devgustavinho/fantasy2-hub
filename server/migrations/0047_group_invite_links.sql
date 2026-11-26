-- Links de convite WhatsApp (grupo geral + um por torre). Singleton editável pelo admin.
CREATE TABLE group_invite_links (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  general_url TEXT,
  tower_1_url TEXT,
  tower_2_url TEXT,
  tower_3_url TEXT,
  tower_4_url TEXT,
  tower_5_url TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO group_invite_links (id) VALUES (1);
