/** Ranking híbrido (cosine + lexical) — puro, sem DB/OpenAI. */

/** Poucos trechos, só os bem parecidos — evita “Leonh Flash / Ideal Vidros” num FAQ de carro. */
export const TOP_K = 4;
export const MIN_SCORE = 0.42;
/** Descarta hits muito abaixo do melhor (mesmo acima do mínimo absoluto). */
export const RELATIVE_GAP = 0.08;
/** Acima disso, restringe ao mesmo source_type do melhor hit (ex.: só FAQ). */
export const STRONG_SCORE = 0.52;

const STOP = new Set([
  "a",
  "as",
  "o",
  "os",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "em",
  "no",
  "na",
  "nos",
  "nas",
  "um",
  "uma",
  "para",
  "por",
  "com",
  "que",
  "quais",
  "qual",
  "temos",
  "tem",
  "são",
  "sao",
  "se",
  "ao",
  "à",
  "ou",
]);

/** Tokens úteis da pergunta (PT), min 3 chars. */
export function queryTokens(question) {
  return String(question || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

/**
 * Boost lexical: frases/exatas + tokens. Penaliza título "PERDA DE GARANTIA" sem casos (sumário).
 * @returns {number} ajuste somado ao cosine (−0.12 … +0.28)
 */
export function lexicalAdjust(question, content) {
  const q = String(question || "").toLowerCase();
  const c = String(content || "").toLowerCase();
  if (!q || !c) return 0;

  let adj = 0;
  const phrasePairs = [
    [/perda\s+d[ae]\s+garantia/, /perda\s+d[ae]\s+garantia/],
    [
      /situa[cç][oõ]es?.{0,40}garantia/,
      /situa[cç][oõ]es\s+n[aã]o\s+cobertas|garantias?\s+ser[aã]o\s+perdidas/,
    ],
  ];
  for (const [qRe, cRe] of phrasePairs) {
    if (qRe.test(q) && cRe.test(c)) adj += 0.14;
  }

  const tokens = queryTokens(question);
  if (tokens.length) {
    const hit = tokens.filter((t) => c.includes(t)).length;
    adj += 0.04 * (hit / tokens.length);
  }

  // Sumário/TOC: cabeçalho sem bullets/casos → falso positivo semântico.
  if (/perda\s+d[ae]\s+garantia/.test(c)) {
    const after = c.split(/perda\s+d[ae]\s+garantia(?:\s+legal)?/)[1] || "";
    const head = after.slice(0, 500);
    const hasCases =
      /ser[aã]o\s+perdidas|seguintes\s+casos/.test(head) ||
      /[●•✓]/.test(head) ||
      /^[\s\S]{0,80}[-–—]\s*\S/m.test(head);
    if (!hasCases) adj -= 0.12;
  }

  return Math.max(-0.12, Math.min(0.28, adj));
}

/**
 * Combina cosine + ajuste lexical.
 * @param {number} cosine
 */
export function combinedScore(question, content, cosine) {
  return Number(cosine) + lexicalAdjust(question, content);
}

/**
 * Escolhe poucos chunks fortes; se o melhor for bem claro, não mistura tipos fracos.
 * @param {Array<{ score: number, sourceType: string, sourceId: string }>} scoredSorted
 */
export function selectHits(scoredSorted) {
  const aboveMin = scoredSorted.filter((s) => s.score >= MIN_SCORE);
  if (aboveMin.length === 0) return [];

  const best = aboveMin[0];
  let pool = aboveMin.filter((s) => s.score >= best.score - RELATIVE_GAP);

  if (best.score >= STRONG_SCORE) {
    const sameType = pool.filter((s) => s.sourceType === best.sourceType);
    // Se o melhor FAQ (etc.) é forte, não espalha pra serviço/pauta fracos.
    if (sameType.length > 0) pool = sameType;
  }

  return pool.slice(0, TOP_K);
}
