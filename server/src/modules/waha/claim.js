import { sqlite } from "../../db/client.js";

const CLAIM_RETENTION_MS = 48 * 60 * 60 * 1000;

const insertClaim = sqlite.prepare(`
  INSERT OR IGNORE INTO waha_inbound_claims (message_id, claimed_at, action)
  VALUES (?, ?, ?)
`);

const pruneClaims = sqlite.prepare(`
  DELETE FROM waha_inbound_claims WHERE claimed_at < ?
`);

/**
 * Claim atômico por id da mensagem WAHA.
 * Retorna true na primeira vez; false se já processamos este inbound (retry / message.any).
 * @param {string} messageId
 * @param {string} [action]
 */
export function claimInboundMessage(messageId, action = null) {
  const id = String(messageId || "").trim();
  if (!id) return false;

  return sqlite.transaction(() => {
    pruneClaims.run(new Date(Date.now() - CLAIM_RETENTION_MS).toISOString());
    const result = insertClaim.run(id, new Date().toISOString(), action);
    return result.changes === 1;
  })();
}
