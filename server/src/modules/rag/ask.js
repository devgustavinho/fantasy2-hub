import { sqlite } from "../../db/client.js";
import {
  answerFromContext,
  blobToEmbedding,
  cosineSimilarity,
  embedTexts,
  isOpenAiConfigured,
} from "./openai.js";

const TOP_K = 6;
const MIN_SCORE = 0.28;

const listChunks = sqlite.prepare(`
  SELECT c.id, c.content, c.embedding, c.chunk_index AS chunkIndex,
         d.source_type AS sourceType, d.source_id AS sourceId, d.title
  FROM rag_chunks c
  JOIN rag_documents d ON d.id = c.document_id
`);

const countDocs = sqlite.prepare("SELECT COUNT(*) AS c FROM rag_documents");
const countChunks = sqlite.prepare("SELECT COUNT(*) AS c FROM rag_chunks");
const lastUpdated = sqlite.prepare(
  "SELECT MAX(updated_at) AS lastUpdatedAt FROM rag_documents",
);
const countsBySource = sqlite.prepare(`
  SELECT source_type AS sourceType, COUNT(*) AS documents
  FROM rag_documents GROUP BY source_type ORDER BY source_type
`);

export function getIndexStatus() {
  return {
    openaiConfigured: isOpenAiConfigured(),
    documents: Number(countDocs.get().c),
    chunks: Number(countChunks.get().c),
    lastUpdatedAt: lastUpdated.get()?.lastUpdatedAt ?? null,
    bySource: countsBySource.all().map((r) => ({
      sourceType: r.sourceType,
      documents: Number(r.documents),
    })),
  };
}

/**
 * @param {string} question
 * @returns {Promise<{ answer: string, citations: object[], scores: object[] }>}
 */
export async function askCondo(question) {
  if (!isOpenAiConfigured()) {
    const err = new Error(
      "Perguntas ao condomínio ainda não estão disponíveis. Peça ao administrador para cadastrar o provedor de IA.",
    );
    err.status = 503;
    throw err;
  }

  const q = String(question || "").trim();
  if (q.length < 3) {
    const err = new Error("Escreva uma pergunta com pelo menos 3 caracteres.");
    err.status = 400;
    throw err;
  }
  if (q.length > 500) {
    const err = new Error("Pergunta muito longa (máx. 500 caracteres).");
    err.status = 400;
    throw err;
  }

  const status = getIndexStatus();
  if (status.chunks === 0) {
    const err = new Error(
      "O índice do condomínio ainda está vazio. Peça à administração para reindexar (npm run rag:reindex).",
    );
    err.status = 503;
    throw err;
  }

  const [queryVec] = await embedTexts(q);
  const scored = [];

  for (const row of listChunks.all()) {
    const vec = blobToEmbedding(row.embedding);
    const score = cosineSimilarity(queryVec, vec);
    scored.push({
      id: row.id,
      content: row.content,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      title: row.title,
      chunkIndex: row.chunkIndex,
      score,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.filter((s) => s.score >= MIN_SCORE).slice(0, TOP_K);

  if (top.length === 0) {
    return {
      answer:
        "Não encontrei essa informação no material indexado do condomínio (FAQ, boas-vindas, serviços, recomendações e pautas oficiais).",
      citations: [],
      scores: scored.slice(0, 3).map((s) => ({
        title: s.title,
        sourceType: s.sourceType,
        score: Number(s.score.toFixed(4)),
      })),
    };
  }

  // Dedup citations por source
  const seen = new Set();
  const citations = [];
  for (const hit of top) {
    const key = `${hit.sourceType}:${hit.sourceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    citations.push({
      title: hit.title,
      sourceType: hit.sourceType,
      sourceId: hit.sourceId,
      excerpt: hit.content.slice(0, 280),
      score: Number(hit.score.toFixed(4)),
    });
  }

  const answer = await answerFromContext({
    question: q,
    contextBlocks: top.map((h) => ({
      title: h.title,
      sourceType: h.sourceType,
      content: h.content,
    })),
  });

  return {
    answer,
    citations,
    scores: top.map((s) => ({
      title: s.title,
      sourceType: s.sourceType,
      score: Number(s.score.toFixed(4)),
    })),
  };
}
