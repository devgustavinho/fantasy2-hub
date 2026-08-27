// Sobe pro R2 qualquer imagem de item de serviço que ainda esteja só no disco local (formato
// antigo "/uploads/services/<arquivo>") e atualiza o caminho salvo no banco pra URL pública do
// bucket. Idempotente: roda em todo deploy, mas só mexe nas linhas que ainda não migraram (já
// migradas têm `path` começando com "http", então são ignoradas). Não falha o deploy se não
// tiver nada pra migrar nem se o diretório antigo não existir mais.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { sqlite } from "../src/db/client.js";
import { uploadToR2 } from "../src/lib/r2.js";

const OLD_UPLOADS_ROOT = path.resolve("data/uploads/services");

const rows = sqlite
  .prepare("SELECT id, path FROM condo_service_item_images WHERE path NOT LIKE 'http%'")
  .all();

if (rows.length === 0) {
  console.log("Nenhuma imagem pendente de migração pro R2.");
  process.exit(0);
}

const updatePath = sqlite.prepare("UPDATE condo_service_item_images SET path = ? WHERE id = ?");

let migrated = 0;
let failed = 0;

for (const row of rows) {
  const filename = row.path.split("/").pop();
  try {
    const buffer = await readFile(path.join(OLD_UPLOADS_ROOT, filename));
    const publicUrl = await uploadToR2(`services/${filename}`, buffer, "image/jpeg");
    updatePath.run(publicUrl, row.id);
    migrated += 1;
    console.log(`migrada: ${row.path} -> ${publicUrl}`);
  } catch (err) {
    failed += 1;
    console.error(`falha ao migrar ${row.path}:`, err.message);
  }
}

console.log(`Migração concluída: ${migrated} imagem(ns) migrada(s), ${failed} falha(s).`);
