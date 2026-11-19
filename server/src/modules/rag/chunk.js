import { createHash } from "node:crypto";

const TARGET_CHARS = 1200;
const OVERLAP_CHARS = 150;

export function contentHash(text) {
  return createHash("sha256").update(text).digest("hex");
}

/** Remove markdown de imagem e comprime espaços demais — embeddings não precisam das URLs. */
export function normalizeForIndex(text) {
  return String(text || "")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Quebra texto em pedaços ~TARGET_CHARS, preferindo limites de parágrafo / seção.
 * @returns {string[]}
 */
export function chunkText(text) {
  const clean = normalizeForIndex(text);
  if (!clean) return [];
  if (clean.length <= TARGET_CHARS) return [clean];

  const parts = clean.split(/\n(?=##\s)|(?:\n{2,})/);
  const chunks = [];
  let current = "";

  const flush = () => {
    const t = current.trim();
    if (t) chunks.push(t);
    current = "";
  };

  for (const part of parts) {
    const piece = part.trim();
    if (!piece) continue;
    if (!current) {
      current = piece;
      continue;
    }
    if (current.length + 2 + piece.length <= TARGET_CHARS) {
      current = `${current}\n\n${piece}`;
      continue;
    }
    flush();
    if (piece.length <= TARGET_CHARS) {
      current = piece;
      continue;
    }
    // Parágrafo enorme: corta por janela com overlap.
    for (let i = 0; i < piece.length; i += TARGET_CHARS - OVERLAP_CHARS) {
      const slice = piece.slice(i, i + TARGET_CHARS).trim();
      if (slice) chunks.push(slice);
    }
    current = "";
  }
  flush();
  return chunks.length > 0 ? chunks : [clean.slice(0, TARGET_CHARS)];
}
