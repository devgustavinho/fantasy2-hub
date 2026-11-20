import jwt from "jsonwebtoken";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { sqlite } from "../db/client.js";
import { env } from "../env.js";
import { signSession } from "./jwt.js";
import { toPublicUser } from "./publicUser.js";
import { attachRoles, listUserRoles, rolesRequire2fa } from "./roles.js";

const PURPOSE_TOKEN_TTL_SECONDS = 10 * 60; // 10 min

const saveTotpSecret = sqlite.prepare("UPDATE users SET totp_secret = ? WHERE id = ?");
const enableTotp = sqlite.prepare("UPDATE users SET totp_enabled = 1 WHERE id = ?");
const getUserById = sqlite.prepare("SELECT * FROM users WHERE id = ?");
const touchLastLogin = sqlite.prepare(
  "UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
);

// Chamado só quando uma sessão JWT de verdade é emitida (não no desafio 2FA).
export function markUserLoggedIn(userId) {
  touchLastLogin.run(userId);
}

export function signPurposeToken(purpose, userId) {
  return jwt.sign({ purpose, sub: userId }, env.JWT_SECRET, { expiresIn: PURPOSE_TOKEN_TTL_SECONDS });
}

export function verifyPurposeToken(token, expectedPurpose) {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (payload.purpose !== expectedPurpose) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

export function verifyTotpCode(secret, code) {
  try {
    return authenticator.check(code, secret);
  } catch {
    return false;
  }
}

function resolveRoles(user) {
  if (Array.isArray(user.roles) && user.roles.length) return user.roles;
  return listUserRoles(user.id);
}

// Chamado por todo login bem-sucedido (senha ou passkey). Aplica o 2FA obrigatório pra
// admin, síndico e conselheiro e, no fim, sempre libera uma sessão de verdade — mesmo pra
// cadastro pendente/recusado (`requireApproved`, na camada de rota, é quem bloqueia as
// funcionalidades reais).
export async function establishSession(user) {
  const roles = resolveRoles(user);
  const withRoles = { ...user, roles };

  if (rolesRequire2fa(roles)) {
    if (!user.totp_enabled) {
      const secret = authenticator.generateSecret();
      saveTotpSecret.run(secret, user.id);
      const otpauthUrl = authenticator.keyuri(user.email, "Fantasy 2 Hub", secret);
      return {
        status: "totp-setup-required",
        token: signPurposeToken("totp-setup", user.id),
        otpauthUrl,
        qrDataUrl: await buildQrDataUrl(otpauthUrl),
      };
    }
    return { status: "totp-verify-required", token: signPurposeToken("totp-verify", user.id) };
  }

  markUserLoggedIn(user.id);
  return { status: "ok", user: toPublicUser(withRoles), token: signSession({ sub: user.id }) };
}

export function confirmTotpSetup(token, code) {
  const userId = verifyPurposeToken(token, "totp-setup");
  if (!userId) return { error: "Link de configuração expirado, faça login novamente." };

  const user = getUserById.get(userId);
  if (!user || !user.totp_secret) return { error: "Configuração de 2FA não encontrada." };
  if (!verifyTotpCode(user.totp_secret, code)) return { error: "Código inválido." };

  enableTotp.run(user.id);
  markUserLoggedIn(user.id);
  return {
    user: toPublicUser({ ...user, totp_enabled: 1 }),
    token: signSession({ sub: user.id }),
  };
}

export function verifyTotpLogin(token, code) {
  const userId = verifyPurposeToken(token, "totp-verify");
  if (!userId) return { error: "Login expirado, faça login novamente." };

  const user = getUserById.get(userId);
  if (!user || !user.totp_enabled) return { error: "2FA não configurado para esta conta." };
  if (!verifyTotpCode(user.totp_secret, code)) return { error: "Código inválido." };

  markUserLoggedIn(user.id);
  return { user: toPublicUser(user), token: signSession({ sub: user.id }) };
}

/** Inicia setup de 2FA com sessão já autenticada (ex.: promovido após login). */
export async function startTotpSetupForUser(user) {
  if (user.totp_enabled) {
    return { error: "2FA já está ativo nesta conta." };
  }
  const secret = authenticator.generateSecret();
  saveTotpSecret.run(secret, user.id);
  const otpauthUrl = authenticator.keyuri(user.email, "Fantasy 2 Hub", secret);
  return {
    otpauthUrl,
    qrDataUrl: await buildQrDataUrl(otpauthUrl),
  };
}

export function confirmTotpSetupForUser(user, code) {
  const row = getUserById.get(user.id);
  if (!row || !row.totp_secret) return { error: "Configuração de 2FA não encontrada. Reinicie o setup." };
  if (row.totp_enabled) return { error: "2FA já está ativo nesta conta." };
  if (!verifyTotpCode(row.totp_secret, code)) return { error: "Código inválido." };

  enableTotp.run(row.id);
  return { user: toPublicUser(attachRoles({ ...row, totp_enabled: 1 })) };
}

export async function buildQrDataUrl(otpauthUrl) {
  return QRCode.toDataURL(otpauthUrl);
}
