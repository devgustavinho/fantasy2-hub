import jwt from "jsonwebtoken";
import { env } from "../env.js";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 180; // 180 dias — app do condomínio, não banco
/** JWT interno emitido a partir de um API token no /mcp (loopback / stdio). */
export const INTERNAL_SESSION_TTL_SECONDS = 5 * 60; // 5 minutos

export function signSession(payload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: SESSION_TTL_SECONDS });
}

/** Sessão curta para o MCP trocar f2h_ → Bearer JWT antes do loopback REST. */
export function signInternalSession(payload) {
  return jwt.sign(
    { ...payload, kind: "internal" },
    env.JWT_SECRET,
    { expiresIn: INTERNAL_SESSION_TTL_SECONDS },
  );
}

export function verifySession(token) {
  try {
    return jwt.verify(token, env.JWT_SECRET);
  } catch {
    return null;
  }
}
