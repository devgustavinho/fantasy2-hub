import { randomUUID } from "node:crypto";
import { sqlite } from "../../db/client.js";
import { removeDocument, upsertDocument } from "./ingest.js";
import { isOpenAiConfigured } from "./openai.js";
import { buildExternalDocumentFromRow } from "./sources.js";

const MAX_BODY_CHARS = 200_000;
const ALLOWED_EXT = new Set([".txt", ".md", ".markdown", ".text", ".csv", ".log"]);

const insertEmbed = sqlite.prepare(`
  INSERT INTO rag_external_embeds (id, title, filename, body, created_by)
  VALUES (@id, @title, @filename, @body, @created_by)
`);

const getEmbed = sqlite.prepare(`
  SELECT id, title, filename, body, created_at AS createdAt, updated_at AS updatedAt,
         created_by AS createdBy
  FROM rag_external_embeds WHERE id = ?
`);

const listEmbeds = sqlite.prepare(`
  SELECT e.id, e.title, e.filename, e.created_at AS createdAt, e.updated_at AS updatedAt,
         e.created_by AS createdBy, u.name AS createdByName,
         (SELECT COUNT(*) FROM rag_chunks c
            JOIN rag_documents d ON d.id = c.document_id
           WHERE d.source_type = 'external' AND d.source_id = e.id) AS chunkCount,
         LENGTH(e.body) AS bodyChars
  FROM rag_external_embeds e
  JOIN users u ON u.id = e.created_by
  ORDER BY e.updated_at DESC
`);

const deleteEmbedRow = sqlite.prepare("DELETE FROM rag_external_embeds WHERE id = ?");

export function isAllowedTextFilename(name) {
  const lower = String(name || "").toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return false;
  return ALLOWED_EXT.has(lower.slice(dot));
}

export function buildExternalDocument(id) {
  return buildExternalDocumentFromRow(getEmbed.get(id));
}

export function listExternalEmbedsPublic() {
  return listEmbeds.all().map((row) => ({
    id: row.id,
    title: row.title,
    filename: row.filename,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: { id: row.createdBy, name: row.createdByName },
    chunkCount: Number(row.chunkCount),
    bodyChars: Number(row.bodyChars),
  }));
}

/**
 * @param {{ title?: string, filename?: string | null, body: string, actorUserId: string }} args
 */
export async function createExternalEmbed({ title, filename, body, actorUserId }) {
  const text = String(body || "").replace(/^\uFEFF/, "");
  if (!text.trim()) {
    const err = new Error("Arquivo ou texto vazio.");
    err.status = 400;
    throw err;
  }
  if (text.length > MAX_BODY_CHARS) {
    const err = new Error(`Texto grande demais (máx. ${MAX_BODY_CHARS.toLocaleString("pt-BR")} caracteres).`);
    err.status = 400;
    throw err;
  }
  if (!isOpenAiConfigured()) {
    const err = new Error("Provedor de IA não configurado — cadastre a API key antes de indexar.");
    err.status = 503;
    throw err;
  }

  const id = randomUUID();
  const cleanTitle =
    String(title || "").trim() ||
    String(filename || "")
      .replace(/\.[^.]+$/, "")
      .trim() ||
    "Documento externo";

  insertEmbed.run({
    id,
    title: cleanTitle.slice(0, 200),
    filename: filename || null,
    body: text,
    created_by: actorUserId,
  });

  const doc = buildExternalDocument(id);
  const result = await upsertDocument(doc, { force: true });
  if (result.skipped && result.reason === "no_openai_key") {
    deleteEmbedRow.run(id);
    const err = new Error("Provedor de IA não configurado.");
    err.status = 503;
    throw err;
  }

  return {
    embed: listExternalEmbedsPublic().find((e) => e.id === id),
    indexed: result,
  };
}

export async function deleteExternalEmbed(id) {
  const row = getEmbed.get(id);
  if (!row) {
    const err = new Error("Embed não encontrado.");
    err.status = 404;
    throw err;
  }
  removeDocument("external", id);
  deleteEmbedRow.run(id);
  return { ok: true };
}

export { MAX_BODY_CHARS, ALLOWED_EXT };
