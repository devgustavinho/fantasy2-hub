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

function ensureMessagesSchema(db) {
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
      raw_json TEXT,
      summarized_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(ts);
  `);
  const cols = db.prepare(`PRAGMA table_info(messages)`).all();
  if (!cols.some((c) => c.name === "summarized_at")) {
    db.exec(`ALTER TABLE messages ADD COLUMN summarized_at INTEGER`);
  }
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_messages_summarized
     ON messages(summarized_at) WHERE summarized_at IS NULL`,
  );
}

function openDayDb(day) {
  if (openDbs.has(day)) return openDbs.get(day);

  const db = new Database(dbPathForDay(day));
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  ensureMessagesSchema(db);
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
 * @param {{ includeSummarized?: boolean }} [opts]
 *   Por padrão omite msgs já incluídas num resumo anterior (`summarized_at`).
 * @returns {{
 *   id: string,
 *   ts: number,
 *   senderPhone: string | null,
 *   pushName: string | null,
 *   body: string | null,
 *   fromMe: boolean,
 *   summarizedAt: number | null,
 * }[]}
 */
export function listDayMessages(day = dayKey(), opts = {}) {
  const includeSummarized = Boolean(opts.includeSummarized);
  const path = dbPathForDay(day);
  if (!existsSync(path)) return [];
  const db = openDayDb(day);
  const where = includeSummarized ? "" : "WHERE summarized_at IS NULL";
  return db
    .prepare(
      `SELECT id, ts, sender_phone AS senderPhone, push_name AS pushName, body,
              from_me AS fromMe, summarized_at AS summarizedAt
       FROM messages ${where}
       ORDER BY ts ASC, rowid ASC`,
    )
    .all()
    .map((r) => ({
      id: String(r.id),
      ts: Number(r.ts),
      senderPhone: r.senderPhone,
      pushName: r.pushName,
      body: r.body,
      fromMe: Boolean(r.fromMe),
      summarizedAt: r.summarizedAt == null ? null : Number(r.summarizedAt),
    }));
}

/**
 * Marca mensagens como já incluídas num resumo (não reaparecem no próximo
 * "resumo" padrão).
 * @param {string[]} ids
 * @param {string} [day]
 * @returns {number} linhas atualizadas
 */
export function markMessagesSummarized(ids, day = dayKey()) {
  const list = [...new Set((ids || []).map((id) => String(id || "").trim()).filter(Boolean))];
  if (list.length === 0) return 0;
  const path = dbPathForDay(day);
  if (!existsSync(path)) return 0;
  const db = openDayDb(day);
  const now = Math.floor(Date.now() / 1000);
  const stmt = db.prepare(
    `UPDATE messages SET summarized_at = ?
     WHERE id = ? AND summarized_at IS NULL`,
  );
  const tx = db.transaction((rows) => {
    let n = 0;
    for (const id of rows) {
      const info = stmt.run(now, id);
      n += info.changes;
    }
    return n;
  });
  return tx(list);
}

/** Contagem de msgs com texto no dia (todas vs. ainda não resumidas). */
export function countDayTextMessages(day = dayKey()) {
  const path = dbPathForDay(day);
  if (!existsSync(path)) return { total: 0, unread: 0 };
  const db = openDayDb(day);
  const total = db
    .prepare(
      `SELECT COUNT(*) AS n FROM messages
       WHERE body IS NOT NULL AND TRIM(body) != ''`,
    )
    .get().n;
  const unread = db
    .prepare(
      `SELECT COUNT(*) AS n FROM messages
       WHERE summarized_at IS NULL
         AND body IS NOT NULL AND TRIM(body) != ''`,
    )
    .get().n;
  return { total: Number(total), unread: Number(unread) };
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
