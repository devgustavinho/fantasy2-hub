import { env } from "../../env.js";
import { wahaFetch, isWahaConfigured } from "./client.js";
import { digitsOnly, phoneFromJid } from "./phones.js";

/** Cache em memória do LID do bot (não muda com frequência). */
let botLidCache = undefined; // undefined = ainda não tentou; "" = sem lid; string = lid
/** @type {Map<string, string|null>} */
const lidToPnCache = new Map();

function normalizeLid(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.includes("@")) return raw.endsWith("@lid") ? raw : "";
  const dig = digitsOnly(raw);
  return dig ? `${dig}@lid` : "";
}

/**
 * LID conhecido do bot: env `WAHA_BOT_LID`, depois cache, depois API WAHA.
 * @returns {Promise<string>} JID `…@lid` ou "".
 */
export async function resolveBotLid() {
  if (botLidCache !== undefined) return botLidCache;

  const fromEnv = normalizeLid(env.WAHA_BOT_LID);
  if (fromEnv) {
    botLidCache = fromEnv;
    return botLidCache;
  }

  const phone = digitsOnly(env.WAHA_BOT_PHONE);
  if (!phone || !isWahaConfigured()) {
    botLidCache = "";
    return botLidCache;
  }

  try {
    const session = encodeURIComponent(env.WAHA_SESSION || "default");
    const data = await wahaFetch(`/api/${session}/lids/pn/${encodeURIComponent(phone)}`);
    botLidCache = normalizeLid(data?.lid) || "";
  } catch (err) {
    console.warn("[waha] resolveBotLid falhou:", err?.message || err);
    botLidCache = "";
  }
  return botLidCache;
}

/**
 * Resolve `@lid` → telefone (`…@c.us` ou só dígitos). Cacheia negativos como null.
 * @param {string} lidJid
 * @returns {Promise<string>} dígitos do telefone ou ""
 */
export async function resolveLidToPhone(lidJid) {
  const lid = normalizeLid(lidJid);
  if (!lid) return "";
  if (lidToPnCache.has(lid)) {
    const cached = lidToPnCache.get(lid);
    return cached ? phoneFromJid(cached) || digitsOnly(cached) : "";
  }
  if (!isWahaConfigured()) return "";

  try {
    const session = encodeURIComponent(env.WAHA_SESSION || "default");
    const key = encodeURIComponent(lid);
    const data = await wahaFetch(`/api/${session}/lids/${key}`);
    const pn = data?.pn ? String(data.pn) : "";
    lidToPnCache.set(lid, pn || null);
    return pn ? phoneFromJid(pn) || digitsOnly(pn) : "";
  } catch (err) {
    console.warn("[waha] resolveLidToPhone falhou:", lid, err?.message || err);
    lidToPnCache.set(lid, null);
    return "";
  }
}

/** Só para selftests. */
export function _resetLidCachesForTests() {
  botLidCache = undefined;
  lidToPnCache.clear();
}
