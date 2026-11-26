/**
 * Selftest mínimo da migration/tabela de links de grupo.
 * Rode: node src/modules/groupLinks/groupLinks.selftest.js
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  join(__dirname, "..", "..", "..", "migrations", "0047_group_invite_links.sql"),
  "utf8",
);

const db = new Database(":memory:");
db.pragma("foreign_keys = OFF"); // só a tabela desta migration; users não existe neste smoke
db.exec(sql);

const row = db.prepare("SELECT general_url, tower_3_url FROM group_invite_links WHERE id = 1").get();
assert.ok(row);
assert.equal(row.general_url, null);
assert.equal(row.tower_3_url, null);

db.prepare("UPDATE group_invite_links SET general_url = ?, tower_3_url = ? WHERE id = 1").run(
  "https://chat.whatsapp.com/geral",
  "https://chat.whatsapp.com/t3",
);

const after = db
  .prepare("SELECT general_url AS g, tower_3_url AS t3 FROM group_invite_links WHERE id = 1")
  .get();
assert.equal(after.g, "https://chat.whatsapp.com/geral");
assert.equal(after.t3, "https://chat.whatsapp.com/t3");

console.log("groupLinks selftest ok");
