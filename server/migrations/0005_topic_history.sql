ALTER TABLE topics ADD COLUMN status_note TEXT;

CREATE TABLE topic_events (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES topics(id),
  actor_user_id TEXT REFERENCES users(id),
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_topic_events_topic ON topic_events(topic_id);
