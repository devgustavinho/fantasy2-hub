#!/usr/bin/env node
/**
 * Backfill / reindex do corpus RAG (FAQ, boas-vindas, serviços, recomendações, pautas).
 *
 * Uso (na pasta server/):
 *   npm run rag:reindex
 *   npm run rag:reindex -- --force
 */
import { reindexAll } from "../src/modules/rag/ingest.js";
import { isOpenAiConfigured } from "../src/modules/rag/openai.js";
import { getIndexStatus } from "../src/modules/rag/ask.js";

const force = process.argv.includes("--force");

async function main() {
  if (!isOpenAiConfigured()) {
    console.error(
      "Provedor de IA não configurado. Cadastre a API key pelo Admin em /perguntar, ou defina OPENAI_API_KEY no .env.",
    );
    process.exit(1);
  }

  console.log(`Reindexando corpus RAG${force ? " (force)" : ""}…`);
  const result = await reindexAll({
    force,
    onProgress: (info) => {
      if (info.error) {
        console.warn(`  ✗ ${info.sourceType}/${info.sourceId}: ${info.error}`);
      } else if (info.skipped) {
        console.log(`  · skip ${info.sourceType}/${info.sourceId} (${info.reason})`);
      } else {
        console.log(
          `  ✓ ${info.sourceType}/${info.sourceId} — ${info.chunks} chunk(s) — ${info.title || ""}`,
        );
      }
    },
  });

  console.log(
    `\nPronto: ${result.upserted} atualizados, ${result.skipped} ignorados, ${result.errors} erros (de ${result.total}).`,
  );
  console.log(getIndexStatus());
  if (result.errors > 0) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
