import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { env } from "../env.js";

if (env.DATABASE_PATH !== ":memory:") {
  mkdirSync(dirname(env.DATABASE_PATH), { recursive: true });
}

export const sqlite = new Database(env.DATABASE_PATH);

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("synchronous = NORMAL");
sqlite.pragma("busy_timeout = 5000");
sqlite.pragma("foreign_keys = ON");
