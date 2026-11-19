import { randomUUID } from "node:crypto";
import { sqlite } from "../../db/client.js";

export const ASK_LIMIT_PER_DAY = 5;
export const ASK_WINDOW_MS = 24 * 60 * 60 * 1000;

const listInWindow = sqlite.prepare(`
  SELECT id, asked_at AS askedAt
  FROM rag_ask_log
  WHERE user_id = ? AND asked_at >= ?
  ORDER BY asked_at ASC
`);

const insertAsk = sqlite.prepare(`
  INSERT INTO rag_ask_log (id, user_id, asked_at) VALUES (?, ?, ?)
`);

const deleteAsk = sqlite.prepare(`DELETE FROM rag_ask_log WHERE id = ?`);

const pruneOld = sqlite.prepare(`
  DELETE FROM rag_ask_log WHERE asked_at < ?
`);

function windowStartIso(now = Date.now()) {
  return new Date(now - ASK_WINDOW_MS).toISOString();
}

function formatResetPt(iso) {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      timeZone: "America/Fortaleza",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * @param {string} userId
 * @returns {{ limit: number, used: number, remaining: number, resetAt: string | null, windowHours: number }}
 */
export function getAskQuota(userId) {
  // Limpeza oportunista — barata e evita crescimento infinito.
  pruneOld.run(windowStartIso());

  const rows = listInWindow.all(userId, windowStartIso());
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

export function quotaPayload(quota) {
  return {
    limit: quota.limit,
    remaining: quota.remaining,
    resetAt: quota.resetAt,
    windowHours: quota.windowHours,
  };
}

export function quotaExceededError(quota) {
  const when = quota.resetAt ? formatResetPt(quota.resetAt) : "em até 24 horas";
  const err = new Error(
    `Limite de ${quota.limit} perguntas a cada 24 horas atingido. Você poderá perguntar de novo após ${when}. (restantes: ${quota.remaining})`,
  );
  err.status = 429;
  err.quota = quotaPayload(quota);
  return err;
}

/**
 * Reserva 1 slot na cota (transação). Devolve o id do log para eventual rollback se o ask falhar.
 * @param {string} userId
 */
export function reserveAskSlot(userId) {
  return sqlite.transaction(() => {
    const quota = getAskQuota(userId);
    if (quota.remaining <= 0) throw quotaExceededError(quota);

    const id = randomUUID();
    const askedAt = new Date().toISOString();
    insertAsk.run(id, userId, askedAt);
    return { id, quota: getAskQuota(userId) };
  })();
}

export function releaseAskSlot(id) {
  if (!id) return;
  deleteAsk.run(id);
}
