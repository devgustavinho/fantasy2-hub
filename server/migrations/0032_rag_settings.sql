-- Configuração do provedor LLM/embeddings do RAG (singleton).
-- A API key fica cifrada em api_key_cipher e NUNCA é devolvida pela API — só `configured`.
CREATE TABLE rag_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  provider TEXT NOT NULL DEFAULT 'openai'
    CHECK (provider IN ('openai')),
  api_key_cipher TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO rag_settings (id, provider) VALUES (1, 'openai');
