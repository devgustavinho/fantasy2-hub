import { randomUUID } from "node:crypto";
import { sqlite } from "../../db/client.js";
import { chunkText, contentHash } from "./chunk.js";
import {
  buildFaqDocument,
  buildHorariosDocuments,
  buildRecommendationDocument,
  buildServiceDocument,
  buildTopicDocument,
  buildWelcomeDocument,
  listAllSourceDocuments,
} from "./sources.js";
import { embedTexts, embeddingToBlob, isOpenAiConfigured } from "./openai.js";

const getDocBySource = sqlite.prepare(
  "SELECT id, content_hash AS contentHash FROM rag_documents WHERE source_type = ? AND source_id = ?",
);

const insertDoc = sqlite.prepare(`
  INSERT INTO rag_documents (id, source_type, source_id, title, content_hash, updated_at)
  VALUES (@id, @source_type, @source_id, @title, @content_hash, @updated_at)
`);

const updateDoc = sqlite.prepare(`
  UPDATE rag_documents
  SET title = @title, content_hash = @content_hash, updated_at = @updated_at
  WHERE id = @id
`);

const deleteChunksByDoc = sqlite.prepare("DELETE FROM rag_chunks WHERE document_id = ?");

const insertChunk = sqlite.prepare(`
  INSERT INTO rag_chunks (id, document_id, chunk_index, content, embedding)
  VALUES (@id, @document_id, @chunk_index, @content, @embedding)
`);

const deleteDocBySource = sqlite.prepare(
  "DELETE FROM rag_documents WHERE source_type = ? AND source_id = ?",
);

const nowIso = () => new Date().toISOString();

/**
 * Upsert de um documento já montado. Sem OPENAI_API_KEY, só registra no log e sai.
 * @param {{ sourceType: string, sourceId: string, title: string, body: string }} doc
 * @param {{ force?: boolean }} [opts]
 */
export async function upsertDocument(doc, opts = {}) {
  if (!doc?.body) {
    removeDocument(doc.sourceType, doc.sourceId);
    return { skipped: true, reason: "empty" };
  }
  if (!isOpenAiConfigured()) {
    return { skipped: true, reason: "no_openai_key" };
  }

  const hash = contentHash(doc.body);
  const existing = getDocBySource.get(doc.sourceType, doc.sourceId);
  if (existing && existing.contentHash === hash && !opts.force) {
    return { skipped: true, reason: "unchanged", documentId: existing.id };
  }

  const pieces = chunkText(doc.body);
  if (pieces.length === 0) {
    removeDocument(doc.sourceType, doc.sourceId);
    return { skipped: true, reason: "empty_chunks" };
  }

  const embeddings = await embedTexts(pieces);
  const documentId = existing?.id || randomUUID();
  const updatedAt = nowIso();

  const write = sqlite.transaction(() => {
    if (existing) {
      updateDoc.run({
        id: documentId,
        title: doc.title,
        content_hash: hash,
        updated_at: updatedAt,
      });
      deleteChunksByDoc.run(documentId);
    } else {
      insertDoc.run({
        id: documentId,
        source_type: doc.sourceType,
        source_id: doc.sourceId,
        title: doc.title,
        content_hash: hash,
        updated_at: updatedAt,
      });
    }

    for (let i = 0; i < pieces.length; i += 1) {
      insertChunk.run({
        id: randomUUID(),
        document_id: documentId,
        chunk_index: i,
        content: pieces[i],
        embedding: embeddingToBlob(embeddings[i]),
      });
    }
  });
  write();

  return { documentId, chunks: pieces.length, sourceType: doc.sourceType, sourceId: doc.sourceId };
}

export function removeDocument(sourceType, sourceId) {
  deleteDocBySource.run(sourceType, String(sourceId));
}

export async function ingestFaq(id) {
  const doc = buildFaqDocument(id);
  if (!doc) {
    removeDocument("faq", id);
    return { removed: true };
  }
  return upsertDocument(doc);
}

export async function ingestWelcome() {
  const doc = buildWelcomeDocument();
  if (!doc) {
    removeDocument("welcome", "1");
    return { removed: true };
  }
  return upsertDocument(doc);
}

export async function ingestService(id) {
  const doc = buildServiceDocument(id);
  if (!doc) {
    removeDocument("service", id);
    return { removed: true };
  }
  return upsertDocument(doc);
}

export async function ingestRecommendation(id) {
  const doc = buildRecommendationDocument(id);
  if (!doc) {
    removeDocument("recommendation", id);
    return { removed: true };
  }
  return upsertDocument(doc);
}

export async function ingestTopic(id) {
  const doc = buildTopicDocument(id);
  if (!doc) {
    removeDocument("topic", id);
    return { removed: true };
  }
  return upsertDocument(doc);
}

/** Reindexa convivência, áreas e janelas de mudança (sem senhas de Wi‑Fi). */
export async function ingestHorarios() {
  const docs = buildHorariosDocuments();
  const live = new Set(docs.map((d) => d.sourceId));
  for (const id of ["convivencia", "areas", "mudanca"]) {
    if (!live.has(id)) removeDocument("horarios", id);
  }
  const results = [];
  for (const doc of docs) {
    results.push(await upsertDocument(doc));
  }
  return results;
}

/** Agenda ingest assíncrono sem derrubar a rota CRUD. */
export function scheduleIngest(label, fn) {
  Promise.resolve()
    .then(fn)
    .catch((err) => {
      console.error(`[rag] falha ao indexar ${label}:`, err?.message || err);
    });
}

/**
 * Reindexa todo o corpus (FAQ, welcome, horários, serviços, contatos do condomínio, pautas, embeds, manual).
 * @param {{ force?: boolean, onProgress?: (info: object) => void }} [opts]
 */
export async function reindexAll(opts = {}) {
  const docs = listAllSourceDocuments();
  const results = { total: docs.length, upserted: 0, skipped: 0, errors: 0, details: [] };

  // Remove docs órfãos (fonte apagada)
  const liveKeys = new Set(docs.map((d) => `${d.sourceType}:${d.sourceId}`));
  const existing = sqlite
    .prepare("SELECT source_type AS sourceType, source_id AS sourceId FROM rag_documents")
    .all();
  for (const row of existing) {
    const key = `${row.sourceType}:${row.sourceId}`;
    if (!liveKeys.has(key)) {
      removeDocument(row.sourceType, row.sourceId);
    }
  }

  for (const doc of docs) {
    try {
      const result = await upsertDocument(doc, { force: opts.force });
      if (result.skipped) results.skipped += 1;
      else results.upserted += 1;
      results.details.push({ ...result, title: doc.title });
      opts.onProgress?.({ ...result, title: doc.title });
    } catch (err) {
      results.errors += 1;
      results.details.push({
        error: err?.message || String(err),
        sourceType: doc.sourceType,
        sourceId: doc.sourceId,
        title: doc.title,
      });
      opts.onProgress?.({
        error: err?.message || String(err),
        sourceType: doc.sourceType,
        sourceId: doc.sourceId,
      });
    }
  }

  return results;
}
