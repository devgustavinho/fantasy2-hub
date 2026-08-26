import jwt from "jsonwebtoken";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { sqlite } from "../db/client.js";
import { env } from "../env.js";
import { signSession, sessionCookieOptions, SESSION_COOKIE } from "./jwt.js";
import { toPublicUser } from "./publicUser.js";

const PURPOSE_TOKEN_TTL_SECONDS = 10 * 60; // 10 min

const saveTotpSecret = sqlite.prepare("UPDATE users SET totp_secret = ? WHERE id = ?");
const enableTotp = sqlite.prepare("UPDATE users SET totp_enabled = 1 WHERE id = ?");
const getUserById = sqlite.prepare("SELECT * FROM users WHERE id = ?");

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

function setSessionCookie(res, userId) {
  const token = signSession({ sub: userId });
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions);
}

// Chamado por todo login bem-sucedido (senha ou passkey). Aplica, nessa ordem: aprovação de
// cadastro → 2FA obrigatório pra admin → sessão de verdade.
export async function establishSession(res, user) {
  if (user.approval_status !== "approved") {
    return { status: user.approval_status };
  }

  if (user.role === "admin") {
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

  setSessionCookie(res, user.id);
  return { status: "ok", user: toPublicUser(user) };
}

export function confirmTotpSetup(res, token, code) {
  const userId = verifyPurposeToken(token, "totp-setup");
  if (!userId) return { error: "Link de configuração expirado, faça login novamente." };

  const user = getUserById.get(userId);
  if (!user || !user.totp_secret) return { error: "Configuração de 2FA não encontrada." };
  if (!verifyTotpCode(user.totp_secret, code)) return { error: "Código inválido." };

  enableTotp.run(user.id);
  setSessionCookie(res, user.id);
  return { user: toPublicUser({ ...user, totp_enabled: 1 }) };
}

export function verifyTotpLogin(res, token, code) {
  const userId = verifyPurposeToken(token, "totp-verify");
  if (!userId) return { error: "Login expirado, faça login novamente." };

  const user = getUserById.get(userId);
  if (!user || !user.totp_enabled) return { error: "2FA não configurado para esta conta." };
  if (!verifyTotpCode(user.totp_secret, code)) return { error: "Código inválido." };

  setSessionCookie(res, user.id);
  return { user: toPublicUser(user) };
}

export async function buildQrDataUrl(otpauthUrl) {
  return QRCode.toDataURL(otpauthUrl);
}
