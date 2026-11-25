/**
 * Smoke puro (sem DB/OpenAI): node src/modules/rag/perda-garantia.selftest.js
 *
 * Garante que o Manual indexável contém a seção de perda de garantia e que o
 * ranking híbrido (cosine simulado + lexical) prioriza o trecho com os casos —
 * não o sumário/TOC — para a pergunta do WhatsApp.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { combinedScore, lexicalAdjust, selectHits } from "./score.js";
import { chunkText, prepareManualForIndex } from "./chunk.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANUAL_TXT = join(
  __dirname,
  "..",
  "..",
  "..",
  "assets",
  "docs",
  "manual-do-proprietario.txt",
);

const QUESTION =
  "Quais situações temos perda de garantia no condomínio?";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const raw = readFileSync(MANUAL_TXT, "utf8");
assert(/PERDA DA GARANTIA/i.test(raw), "asset .txt deve ter PERDA DA GARANTIA");
assert(
  /As garantias serão perdidas nos seguintes casos/i.test(raw),
  "asset .txt deve listar os casos de perda",
);

const prepared = prepareManualForIndex(raw);
assert(prepared.length > 1000, "prepareManualForIndex não pode esvaziar o manual");
assert(
  !/ÍNDICE GERAL/i.test(prepared),
  "índice geral deve ser removido do corpus indexado",
);
assert(
  /^## PERDA DA GARANTIA/m.test(prepared),
  "seção PERDA DA GARANTIA deve virar heading ##",
);

const chunks = chunkText(prepared);
assert(chunks.length >= 50, `esperado muitos chunks, veio ${chunks.length}`);

const contentChunk = chunks.find(
  (c) =>
    /PERDA DA GARANTIA/i.test(c) &&
    /As garantias serão perdidas nos seguintes casos/i.test(c),
);
assert(contentChunk, "chunk de conteúdo com lista de casos deve existir");

const tocLike = chunks.find(
  (c) =>
    /PERDA DE GARANTIA/i.test(c) &&
    !/serão perdidas|seguintes casos/i.test(c) &&
    !/[●•✓]/.test(c.split(/PERDA DE GARANTIA/i)[1]?.slice(0, 400) || ""),
);

assert(
  lexicalAdjust(QUESTION, contentChunk) >
    lexicalAdjust(QUESTION, tocLike || "PERDA DE GARANTIA\n\nSITUAÇÕES ESPECIAIS"),
  "lexical deve favorecer o chunk com casos vs sumário",
);

// Simula cosine: sumário “parece” a pergunta (frase exata) mas perde no score combinado.
const faux = [
  {
    id: "toc",
    content: tocLike || "PERDA DE GARANTIA\n\nSITUAÇÕES NÃO COBERTAS PELA GARANTIA\n\nSITUAÇÕES ESPECIAIS",
    sourceType: "manual",
    sourceId: "proprietario",
    title: "Manual do Proprietário — Fantasy 2",
    cosine: 0.55,
  },
  {
    id: "faq",
    content: "Horário da academia: segunda a sexta 6h–22h.",
    sourceType: "faq",
    sourceId: "x",
    title: "Horário academia",
    cosine: 0.48,
  },
  {
    id: "casos",
    content: contentChunk,
    sourceType: "manual",
    sourceId: "proprietario",
    title: "Manual do Proprietário — Fantasy 2",
    cosine: 0.5,
  },
].map((row) => ({
  ...row,
  score: combinedScore(QUESTION, row.content, row.cosine),
}));

faux.sort((a, b) => b.score - a.score);
const hits = selectHits(faux);
assert(hits.length > 0, "selectHits deve retornar algo");
assert(
  hits[0].id === "casos",
  `melhor hit deve ser o chunk com casos (foi ${hits[0].id}, scores=${JSON.stringify(
    faux.map((f) => ({ id: f.id, score: Number(f.score.toFixed(3)) })),
  )})`,
);
assert(
  hits.some((h) => h.sourceType === "manual" && /serão perdidas/i.test(h.content)),
  "hits devem incluir fonte manual com os casos de perda de garantia",
);

console.log("rag perda-garantia.selftest: ok");
console.log(
  `  chunks=${chunks.length} lexical(casos)=${lexicalAdjust(QUESTION, contentChunk).toFixed(3)} top=${hits[0].id}`,
);
