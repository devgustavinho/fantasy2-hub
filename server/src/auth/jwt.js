import jwt from "jsonwebtoken";
import { env } from "../env.js";

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
