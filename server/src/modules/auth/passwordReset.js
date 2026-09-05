import { randomBytes, randomUUID, createHash } from "node:crypto";
import { sqlite } from "../../db/client.js";

const TOKEN_TTL_MS = 60 * 60 * 1000;

const hashToken = (token) => createHash("sha256").update(token).digest("hex");

const insertToken = sqlite.prepare(`
  INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
  VALUES (@id, @user_id, @token_hash, @expires_at)
`);

// Gera um token de uso único (1h de validade) pra redefinição de senha. Só o hash (sha256) fica
// no banco — o token puro (o que vai no link do e-mail) nunca é persistido, então um vazamento
// do banco não dá pra ninguém reaproveitar links antigos.
export function createPasswordResetToken(userId) {
  const token = randomBytes(32).toString("base64url");
  insertToken.run({
    id: randomUUID(),
    user_id: userId,
    token_hash: hashToken(token),
    expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
  });
  return token;
}

const getValidToken = sqlite.prepare(`
  SELECT prt.id, prt.user_id, u.name
  FROM password_reset_tokens prt
  JOIN users u ON u.id = prt.user_id
  WHERE prt.token_hash = ? AND prt.used_at IS NULL AND prt.expires_at > ?
`);
const markTokenUsed = sqlite.prepare("UPDATE password_reset_tokens SET used_at = ? WHERE id = ?");

// Confirma um token e já marca como usado (uso único). Devolve null se o token não existir, já
// tiver sido usado ou tiver expirado — a rota trata tudo isso como "link inválido ou expirado",
// sem distinguir o motivo pro cliente (não há valor nenhum em vazar qual dos três foi).
export function consumePasswordResetToken(rawToken) {
  const now = new Date().toISOString();
  const row = getValidToken.get(hashToken(rawToken), now);
  if (!row) return null;

  markTokenUsed.run(now, row.id);
  return { userId: row.user_id, userName: row.name };
}
