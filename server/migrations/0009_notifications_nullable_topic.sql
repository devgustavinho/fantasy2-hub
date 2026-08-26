-- topic_id precisa aceitar NULL: quando um tópico é excluído, o morador ainda recebe uma
-- notificação explicando o motivo, mas não há mais um tópico pra referenciar.
CREATE TABLE notifications_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  topic_id TEXT REFERENCES topics(id),
  message TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO notifications_new (id, user_id, topic_id, message, read_at, created_at)
SELECT id, user_id, topic_id, message, read_at, created_at FROM notifications;

DROP TABLE notifications;
ALTER TABLE notifications_new RENAME TO notifications;

CREATE INDEX idx_notifications_user ON notifications(user_id, read_at);
