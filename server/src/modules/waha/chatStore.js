import { mkdirSync, readdirSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { env } from "../../env.js";

const RETENTION_DAYS = 7;
const TZ = "America/Fortaleza";

const openDbs = new Map();

function dataDir() {
  const dir = env.WAHA_CHAT_DATA_DIR || "./data/waha-chats";
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Dia civil no fuso do condomínio (YYYY-MM-DD). */
export function dayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function dbPathForDay(day) {
  return join(dataDir(), `${day}.sqlite`);
}

function openDayDb(day) {
  if (openDbs.has(day)) return openDbs.get(day);

  const db = new Database(dbPathForDay(day));
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      chat_id TEXT NOT NULL,
      sender_jid TEXT,
      sender_phone TEXT,
      push_name TEXT,
      body TEXT,
      from_me INTEGER NOT NULL DEFAULT 0,
      has_media INTEGER NOT NULL DEFAULT 0,
      raw_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(ts);
  `);
  openDbs.set(day, db);
  return db;
}

/**
 * @param {{
 *   id: string,
 *   timestamp: number,
 *   chatId: string,
 *   senderJid?: string,
 *   senderPhone?: string,
 *   pushName?: string,
 *   body?: string,
 *   fromMe?: boolean,
 *   hasMedia?: boolean,
 *   raw?: object,
 * }} msg
 */
export function appendGroupMessage(msg) {
  const tsMs =
    msg.timestamp > 1e12 ? Number(msg.timestamp) : Number(msg.timestamp) * 1000;
  const day = dayKey(new Date(tsMs || Date.now()));
  const db = openDayDb(day);
  db.prepare(
    `INSERT OR IGNORE INTO messages
      (id, ts, chat_id, sender_jid, sender_phone, push_name, body, from_me, has_media, raw_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    msg.id,
    Math.floor(tsMs / 1000) || Math.floor(Date.now() / 1000),
    msg.chatId,
    msg.senderJid || null,
    msg.senderPhone || null,
    msg.pushName || null,
    msg.body || null,
    msg.fromMe ? 1 : 0,
    msg.hasMedia ? 1 : 0,
    msg.raw ? JSON.stringify(msg.raw) : null,
  );

  // Limpeza oportunista a cada gravação (barata: só lista arquivos).
  purgeOlderThan(RETENTION_DAYS);
}

/**
 * @param {string} [day] YYYY-MM-DD no fuso Fortaleza
 * @returns {{ ts: number, senderPhone: string | null, pushName: string | null, body: string | null, fromMe: boolean }[]}
 */
export function listDayMessages(day = dayKey()) {
  const path = dbPathForDay(day);
  if (!existsSync(path)) return [];
  const db = openDayDb(day);
  return db
    .prepare(
      `SELECT ts, sender_phone AS senderPhone, push_name AS pushName, body, from_me AS fromMe
       FROM messages ORDER BY ts ASC, rowid ASC`,
    )
    .all()
    .map((r) => ({
      ts: Number(r.ts),
      senderPhone: r.senderPhone,
      pushName: r.pushName,
      body: r.body,
      fromMe: Boolean(r.fromMe),
    }));
}

export function purgeOlderThan(days = RETENTION_DAYS) {
  const dir = dataDir();
  // cutoff = dia civil (Fortaleza) menos N dias, em calendário YYYY-MM-DD.
  const today = dayKey();
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - days);
  const cutoffKey = dt.toISOString().slice(0, 10);

  for (const name of readdirSync(dir)) {
    const m = /^(\d{4}-\d{2}-\d{2})\.sqlite$/.exec(name);
    if (!m) continue;
    if (m[1] >= cutoffKey) continue;
    const full = join(dir, name);
    const day = m[1];
    try {
      const open = openDbs.get(day);
      if (open) {
        open.close();
        openDbs.delete(day);
      }
      unlinkSync(full);
      // WAL companions
      for (const suffix of ["-wal", "-shm"]) {
        const side = full + suffix;
        if (existsSync(side)) unlinkSync(side);
      }
    } catch (err) {
      console.warn(`[waha] falha ao apagar chat diário ${name}:`, err.message);
    }
  }
}

export const CHAT_RETENTION_DAYS = RETENTION_DAYS;
export const CHAT_TZ = TZ;
