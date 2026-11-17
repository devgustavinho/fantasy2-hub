-- Quadro pequeno de melhorias do Portal: moradores sugerem; admin/síndico move o status.
CREATE TABLE portal_improvements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'reviewing', 'in_progress', 'done')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_portal_improvements_status ON portal_improvements(status, updated_at DESC);
CREATE INDEX idx_portal_improvements_created_by ON portal_improvements(created_by);
