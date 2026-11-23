import { randomUUID } from "node:crypto";
import { sqlite } from "../../db/client.js";
import {
  ASK_LIMIT_PER_DAY,
  ASK_WINDOW_MS,
  quotaExceededError,
  quotaPayload,
} from "../rag/quota.js";

const listInWindow = sqlite.prepare(`
  SELECT id, asked_at AS askedAt
  FROM waha_ask_log
  WHERE phone = ? AND asked_at >= ?
  ORDER BY asked_at ASC
`);

const insertAsk = sqlite.prepare(`
  INSERT INTO waha_ask_log (id, phone, asked_at) VALUES (?, ?, ?)
`);

const deleteAsk = sqlite.prepare(`DELETE FROM waha_ask_log WHERE id = ?`);

const pruneOld = sqlite.prepare(`
  DELETE FROM waha_ask_log WHERE asked_at < ?
`);

function windowStartIso(now = Date.now()) {
  return new Date(now - ASK_WINDOW_MS).toISOString();
}

/**
 * Mesma cota do portal (5 / 24h), chaveada pelo número WhatsApp.
 * @param {string} phone dígitos
 */
export function getWahaAskQuota(phone) {
  pruneOld.run(windowStartIso());
  const rows = listInWindow.all(phone, windowStartIso());
  const used = rows.length;
  const remaining = Math.max(0, ASK_LIMIT_PER_DAY - used);
  const oldest = rows[0]?.askedAt ?? null;
  const resetAt = oldest
    ? new Date(new Date(oldest).getTime() + ASK_WINDOW_MS).toISOString()
    : null;

  return {
    limit: ASK_LIMIT_PER_DAY,
    used,
    remaining,
    resetAt,
    windowHours: 24,
  };
}

export function reserveWahaAskSlot(phone) {
  return sqlite.transaction(() => {
    const quota = getWahaAskQuota(phone);
    if (quota.remaining <= 0) throw quotaExceededError(quota);

    const id = randomUUID();
    const askedAt = new Date().toISOString();
    insertAsk.run(id, phone, askedAt);
    return { id, quota: getWahaAskQuota(phone) };
  })();
}

export function releaseWahaAskSlot(id) {
  if (!id) return;
  deleteAsk.run(id);
}

export { quotaPayload, ASK_LIMIT_PER_DAY };
