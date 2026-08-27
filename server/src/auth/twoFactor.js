import jwt from "jsonwebtoken";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { sqlite } from "../db/client.js";
import { env } from "../env.js";
import { signSession } from "./jwt.js";
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

// Chamado por todo login bem-sucedido (senha ou passkey). Aplica o 2FA obrigatório pra
// admin e, no fim, sempre libera uma sessão de verdade — mesmo pra cadastro pendente/
// recusado (`requireApproved`, na camada de rota, é quem bloqueia as funcionalidades reais).
// Isso deixa o usuário pendente logado o bastante pra, por exemplo, ativar notificação push
// e ser avisado quando for aprovado.
//
// O token de sessão vai no corpo da resposta (não em cookie) — o front manda de volta via
// header `Authorization: Bearer`. Cookie cross-site (front no Cloudflare Pages, API na VPS)
// esbarrava no bloqueio de cookie de terceiro do Safari por padrão, mesmo com SameSite=None;
// Secure configurado certo; Chrome ainda permite, por isso só usuário de iPhone reclamava.
export async function establishSession(user) {
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

  return { status: "ok", user: toPublicUser(user), token: signSession({ sub: user.id }) };
}

export function confirmTotpSetup(token, code) {
  const userId = verifyPurposeToken(token, "totp-setup");
  if (!userId) return { error: "Link de configuração expirado, faça login novamente." };

  const user = getUserById.get(userId);
  if (!user || !user.totp_secret) return { error: "Configuração de 2FA não encontrada." };
  if (!verifyTotpCode(user.totp_secret, code)) return { error: "Código inválido." };

  enableTotp.run(user.id);
  return { user: toPublicUser({ ...user, totp_enabled: 1 }), token: signSession({ sub: user.id }) };
}

export function verifyTotpLogin(token, code) {
  const userId = verifyPurposeToken(token, "totp-verify");
  if (!userId) return { error: "Login expirado, faça login novamente." };

  const user = getUserById.get(userId);
  if (!user || !user.totp_enabled) return { error: "2FA não configurado para esta conta." };
  if (!verifyTotpCode(user.totp_secret, code)) return { error: "Código inválido." };

  return { user: toPublicUser(user), token: signSession({ sub: user.id }) };
}

export async function buildQrDataUrl(otpauthUrl) {
  return QRCode.toDataURL(otpauthUrl);
}
