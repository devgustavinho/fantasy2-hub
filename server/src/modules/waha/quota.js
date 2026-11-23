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
  INSERT INTO waha_ask_log (id, phone, asked_at, message_id) VALUES (?, ?, ?, ?)
`);

const findByMessageId = sqlite.prepare(`
  SELECT id FROM waha_ask_log WHERE message_id = ?
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

/**
 * Reserva 1 slot de cota. Se `messageId` já foi cobrado, devolve o slot existente
 * sem incrementar de novo (idempotente sob webhook duplicado).
 * @param {string} phone
 * @param {string} [messageId]
 */
export function reserveWahaAskSlot(phone, messageId) {
  const mid = messageId ? String(messageId).trim() : "";
  return sqlite.transaction(() => {
    if (mid) {
      const existing = findByMessageId.get(mid);
      if (existing) {
        return { id: existing.id, quota: getWahaAskQuota(phone), duplicate: true };
      }
    }

    const quota = getWahaAskQuota(phone);
    if (quota.remaining <= 0) throw quotaExceededError(quota);

    const id = randomUUID();
    const askedAt = new Date().toISOString();
    insertAsk.run(id, phone, askedAt, mid || null);
    return { id, quota: getWahaAskQuota(phone), duplicate: false };
  })();
}

export function releaseWahaAskSlot(id) {
  if (!id) return;
  deleteAsk.run(id);
}

export { quotaPayload, ASK_LIMIT_PER_DAY };
