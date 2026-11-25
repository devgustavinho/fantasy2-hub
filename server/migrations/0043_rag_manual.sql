-- Fonte built-in: Manual do Proprietário (PDF em assets/docs).
-- SQLite não altera CHECK — recria rag_documents (+ chunks por FK).
CREATE TABLE rag_documents_new (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (
    source_type IN ('faq', 'welcome', 'service', 'recommendation', 'topic', 'external', 'manual')
  ),
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (source_type, source_id)
);

INSERT INTO rag_documents_new (id, source_type, source_id, title, content_hash, updated_at)
SELECT id, source_type, source_id, title, content_hash, updated_at FROM rag_documents;

CREATE TABLE rag_chunks_new (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES rag_documents_new(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (document_id, chunk_index)
);

INSERT INTO rag_chunks_new (id, document_id, chunk_index, content, embedding, created_at)
SELECT id, document_id, chunk_index, content, embedding, created_at FROM rag_chunks;

DROP TABLE rag_chunks;
DROP TABLE rag_documents;
ALTER TABLE rag_documents_new RENAME TO rag_documents;
ALTER TABLE rag_chunks_new RENAME TO rag_chunks;

CREATE INDEX idx_rag_documents_source ON rag_documents(source_type, source_id);
CREATE INDEX idx_rag_documents_updated ON rag_documents(updated_at);
CREATE INDEX idx_rag_chunks_document ON rag_chunks(document_id);
