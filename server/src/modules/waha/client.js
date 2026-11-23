import { env } from "../../env.js";

function baseUrl() {
  return String(env.WAHA_URL || "").replace(/\/+$/, "");
}

export function isWahaConfigured() {
  return Boolean(env.WAHA_ENABLED && baseUrl() && env.WAHA_API_KEY && env.WAHA_SESSION);
}

/**
 * @param {string} path
 * @param {{ method?: string, body?: object }} [opts]
 */
export async function wahaFetch(path, { method = "GET", body } = {}) {
  if (!isWahaConfigured()) {
    const err = new Error("WAHA não configurado (WAHA_ENABLED / WAHA_URL / WAHA_API_KEY).");
    err.status = 503;
    throw err;
  }

  const url = `${baseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Api-Key": env.WAHA_API_KEY,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const msg = data?.message || data?.error || `WAHA HTTP ${res.status}`;
    const err = new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    err.status = res.status >= 500 ? 502 : 400;
    err.waha = data;
    throw err;
  }
  return data;
}

/**
 * @param {{ chatId: string, text: string, replyTo?: string | null }} args
 */
export async function sendText({ chatId, text, replyTo = null }) {
  const body = {
    session: env.WAHA_SESSION,
    chatId,
    text,
  };
  if (replyTo) body.reply_to = replyTo;
  return wahaFetch("/api/sendText", { method: "POST", body });
}
