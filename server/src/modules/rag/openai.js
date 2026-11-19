import { resolveApiKey } from "./settings.js";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMS = 1536;
const CHAT_MODEL = "gpt-4o-mini";

export function isOpenAiConfigured() {
  return Boolean(resolveApiKey());
}

export function embeddingDims() {
  return EMBEDDING_DIMS;
}

async function openaiJson(path, body) {
  const key = resolveApiKey();
  if (!key) {
    const err = new Error(
      "Provedor de IA não configurado. Peça ao administrador para cadastrar a API key em Perguntar.",
    );
    err.status = 503;
    throw err;
  }

  const res = await fetch(`https://api.openai.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `OpenAI HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status >= 500 ? 502 : 400;
    throw err;
  }
  return data;
}

/** @param {string | string[]} input */
export async function embedTexts(input) {
  const texts = Array.isArray(input) ? input : [input];
  if (texts.length === 0) return [];

  const data = await openaiJson("/embeddings", {
    model: EMBEDDING_MODEL,
    input: texts,
  });

  const byIndex = new Map(data.data.map((row) => [row.index, row.embedding]));
  return texts.map((_, i) => {
    const vec = byIndex.get(i);
    if (!vec || vec.length !== EMBEDDING_DIMS) {
      throw new Error("Resposta de embedding inválida da OpenAI.");
    }
    return Float32Array.from(vec);
  });
}

/**
 * Resposta curta só com o contexto fornecido.
 * @param {{ question: string, contextBlocks: { title: string, sourceType: string, content: string }[] }} args
 * @returns {Promise<{ answer: string, usedIndices: number[] }>} usedIndices = 1-based [#n] realmente usados
 */
export async function answerFromContext({ question, contextBlocks }) {
  const context = contextBlocks
    .map(
      (b, i) =>
        `[#${i + 1} | ${b.sourceType} | ${b.title}]\n${b.content}`,
    )
    .join("\n\n---\n\n");

  const data = await openaiJson("/chat/completions", {
    model: CHAT_MODEL,
    temperature: 0.2,
    max_tokens: 450,
    messages: [
      {
        role: "system",
        content:
          "Você é o assistente do condomínio Fantasy 2. Responda em português do Brasil, de forma curta e clara. " +
          "Use APENAS o contexto fornecido. Se o contexto não tiver a resposta, diga que não encontrou essa informação no material do condomínio. " +
          "Não invente regras, horários ou contatos. Ignore blocos que não ajudam a responder. " +
          "Quando citar, mencione o título da fonte entre aspas. " +
          "Na ÚLTIMA linha da resposta, escreva exatamente: FONTES: n,m (números [#n] que você usou de verdade; se nenhum, FONTES: nenhum).",
      },
      {
        role: "user",
        content: `Contexto:\n${context}\n\nPergunta do morador:\n${question}`,
      },
    ],
  });

  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("Resposta vazia do modelo.");

  const fontesMatch = raw.match(/\nFONTES:\s*(.+)\s*$/i);
  let usedIndices = [];
  let answer = raw;
  if (fontesMatch) {
    answer = raw.slice(0, fontesMatch.index).trim();
    const list = fontesMatch[1].trim().toLowerCase();
    if (list !== "nenhum" && list !== "none") {
      usedIndices = [...list.matchAll(/\d+/g)]
        .map((m) => Number(m[0]))
        .filter((n) => n >= 1 && n <= contextBlocks.length);
    }
  }
  // Fallback: se o modelo esqueceu FONTES, assume só o 1º bloco (o mais similar).
  if (usedIndices.length === 0 && contextBlocks.length > 0 && !/não encontrei/i.test(answer)) {
    usedIndices = [1];
  }

  return { answer, usedIndices };
}

/** Serializa Float32Array → Buffer (BLOB). Cópia alinhada pra SQLite. */
export function embeddingToBlob(vec) {
  return Buffer.from(new Float32Array(vec).buffer);
}

/** Lê BLOB → Float32Array (cópia alinhada). */
export function blobToEmbedding(blob) {
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  const copy = new ArrayBuffer(buf.byteLength);
  new Uint8Array(copy).set(buf);
  return new Float32Array(copy);
}

export function cosineSimilarity(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
