import jwt from "jsonwebtoken";
import { env, isProd } from "../env.js";

export const SESSION_COOKIE = "fantasy2_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 180; // 180 dias — app do condomínio, não banco

export function signSession(payload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: SESSION_TTL_SECONDS });
}

export function verifySession(token) {
  try {
    return jwt.verify(token, env.JWT_SECRET);
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: isProd,
  // Front (Cloudflare Pages) e API (VPS) vivem em domínios diferentes, então o cookie
  // precisa ser cross-site. SameSite=None exige Secure, por isso só em produção (HTTPS);
  // em dev local (http://localhost) cai para "lax", que é o único valor aceito sem Secure.
  sameSite: isProd ? "none" : "lax",
  path: "/",
  maxAge: SESSION_TTL_SECONDS * 1000,
};
