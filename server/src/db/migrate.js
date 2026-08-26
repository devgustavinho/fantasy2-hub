import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sqlite } from "./client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "..", "migrations");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`);

const applied = new Set(
  sqlite.prepare("SELECT name FROM _migrations").all().map((row) => row.name),
);

const files = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

let count = 0;
for (const file of files) {
  if (applied.has(file)) continue;
  const sql = readFileSync(join(migrationsDir, file), "utf8");
  // foreign_keys é no-op dentro de transação, então migrations que recriam tabelas
  // (ex. mudar um CHECK constraint) precisam desabilitar antes de abrir a transação.
  sqlite.pragma("foreign_keys = OFF");
  const runMigration = sqlite.transaction(() => {
    sqlite.exec(sql);
    sqlite.prepare("INSERT INTO _migrations (name) VALUES (?)").run(file);
  });
  runMigration();
  sqlite.pragma("foreign_keys = ON");
  console.log(`applied migration: ${file}`);
  count += 1;
}

console.log(count === 0 ? "no pending migrations" : `${count} migration(s) applied`);
