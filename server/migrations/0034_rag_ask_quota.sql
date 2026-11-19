-- Cota de perguntas RAG por usuário (janela móvel de 24h).
CREATE TABLE rag_ask_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_rag_ask_log_user_time ON rag_ask_log(user_id, asked_at);
