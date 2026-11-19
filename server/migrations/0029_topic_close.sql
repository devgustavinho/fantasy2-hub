-- Fechar pauta: status `closed` + tipo (debatida / não pautada) + motivo livre.
-- SQLite não altera CHECK — recria topics preservando status_note (0005).
CREATE TABLE topics_new (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'scheduled', 'closed')),
  assembly_date TEXT,
  status_note TEXT,
  close_kind TEXT
    CHECK (close_kind IS NULL OR close_kind IN ('debated', 'not_scheduled')),
  close_reason TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (status = 'closed' AND close_kind IS NOT NULL AND close_reason IS NOT NULL AND closed_at IS NOT NULL)
    OR (status != 'closed' AND close_kind IS NULL AND close_reason IS NULL AND closed_at IS NULL)
  )
);

INSERT INTO topics_new (
  id, title, description, created_by, status, assembly_date, status_note,
  close_kind, close_reason, closed_at, created_at, updated_at
)
SELECT
  id, title, description, created_by, status, assembly_date, status_note,
  NULL, NULL, NULL, created_at, updated_at
FROM topics;

DROP TABLE topics;
ALTER TABLE topics_new RENAME TO topics;

CREATE INDEX idx_topics_status ON topics(status);
CREATE INDEX idx_topics_closed_at ON topics(closed_at DESC);
