import { createHash, randomBytes } from "node:crypto";

export const API_TOKEN_PREFIX = "f2h_";
/** Prefixo visível na listagem (f2h_ + 8 chars do material aleatório). */
export const DISPLAY_PREFIX_LENGTH = 12;
export const MAX_ACTIVE_TOKENS = 5;
export const STAFF_TOKEN_TTL_DAYS = 90;

export function hashApiToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

/** Gera `f2h_` + 32 bytes aleatórios em base64url. Valor em claro só existe aqui. */
export function generateApiToken() {
  const token = `${API_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  return {
    token,
    prefix: token.slice(0, DISPLAY_PREFIX_LENGTH),
    tokenHash: hashApiToken(token),
  };
}

export function isApiTokenFormat(token) {
  return typeof token === "string" && token.startsWith(API_TOKEN_PREFIX);
}
