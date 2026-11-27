import { sqlite } from "../../db/client.js";
import {
  answerFromContext,
  blobToEmbedding,
  cosineSimilarity,
  embedTexts,
  isOpenAiConfigured,
} from "./openai.js";
import { combinedScore, selectHits } from "./score.js";

export { selectHits, combinedScore, lexicalAdjust, queryTokens } from "./score.js";

const MAX_CITATIONS = 2;

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

function citationFromHit(hit) {
  return {
    title: hit.title,
    sourceType: hit.sourceType,
    sourceId: hit.sourceId,
    excerpt: hit.content.slice(0, 280),
    score: Number(hit.score.toFixed(4)),
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
    const cosine = cosineSimilarity(queryVec, vec);
    const score = combinedScore(q, row.content, cosine);
    scored.push({
      id: row.id,
      content: row.content,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      title: row.title,
      chunkIndex: row.chunkIndex,
      score,
      cosine,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = selectHits(scored);

  if (top.length === 0) {
    return {
      answer:
        "Não encontrei essa informação no material indexado do condomínio (FAQ, boas-vindas, serviços, contatos do condomínio, pautas oficiais e Manual do Proprietário).",
      citations: [],
      scores: scored.slice(0, 3).map((s) => ({
        title: s.title,
        sourceType: s.sourceType,
        score: Number(s.score.toFixed(4)),
      })),
    };
  }

  const { answer, usedIndices } = await answerFromContext({
    question: q,
    contextBlocks: top.map((h) => ({
      title: h.title,
      sourceType: h.sourceType,
      content: h.content,
    })),
  });

  // Cita só os blocos que o modelo declarou ter usado (e no máx. MAX_CITATIONS docs).
  const usedHits =
    usedIndices.length > 0
      ? usedIndices.map((n) => top[n - 1]).filter(Boolean)
      : top.slice(0, 1);

  const seen = new Set();
  const citations = [];
  for (const hit of usedHits) {
    const key = `${hit.sourceType}:${hit.sourceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    citations.push(citationFromHit(hit));
    if (citations.length >= MAX_CITATIONS) break;
  }

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
