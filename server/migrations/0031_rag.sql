-- Índice semântico do condomínio (RAG): documentos curados + chunks com embeddings no SQLite.
CREATE TABLE rag_documents (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (
    source_type IN ('faq', 'welcome', 'service', 'recommendation', 'topic')
  ),
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (source_type, source_id)
);
CREATE INDEX idx_rag_documents_source ON rag_documents(source_type, source_id);
CREATE INDEX idx_rag_documents_updated ON rag_documents(updated_at);

CREATE TABLE rag_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  -- Float32 little-endian (text-embedding-3-small = 1536 dims)
  embedding BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (document_id, chunk_index)
);
CREATE INDEX idx_rag_chunks_document ON rag_chunks(document_id);
