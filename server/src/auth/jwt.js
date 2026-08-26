import jwt from "jsonwebtoken";
import { env, isProd } from "../env.js";

export const SESSION_COOKIE = "fantasy2_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 dias

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
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_TTL_SECONDS * 1000,
};
