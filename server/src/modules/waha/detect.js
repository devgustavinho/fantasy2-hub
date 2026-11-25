import { env } from "../../env.js";
import { dayKey } from "./chatStore.js";
import { digitsOnly, phoneFromJid, phonesMatch } from "./phones.js";

/**
 * Normaliza o envelope WAHA (message / message.any) num formato interno.
 * @param {object} event
 */
export function normalizeEvent(event) {
  const payload = event?.payload || {};
  const chatId = String(payload.from || "");
  const isGroup = chatId.endsWith("@g.us");
  const senderJid = isGroup
    ? String(payload.participant || payload.author || "")
    : chatId;
  const meId = event?.me?.id ? String(event.me.id) : "";
  const botPhone = digitsOnly(env.WAHA_BOT_PHONE) || phoneFromJid(meId);

  return {
    eventName: String(event?.event || ""),
    session: String(event?.session || ""),
    id: String(payload.id || ""),
    timestamp: Number(payload.timestamp || 0),
    chatId,
    isGroup,
    fromMe: Boolean(payload.fromMe),
    body: typeof payload.body === "string" ? payload.body : "",
    hasMedia: Boolean(payload.hasMedia),
    pushName: payload._data?.notifyName || payload._data?.pushName || payload.notifyName || null,
    senderJid,
    senderPhone: phoneFromJid(senderJid) || phoneFromJid(chatId),
    botPhone,
    meId,
    replyTo: extractReplyTo(payload),
    mentionIds: extractMentionIds(payload),
    raw: payload,
  };
}

function extractReplyTo(payload) {
  if (payload.replyTo) {
    return {
      id: String(payload.replyTo.id || payload.replyTo || ""),
      participant: payload.replyTo.participant || null,
      body: payload.replyTo.body || null,
      fromMe:
        payload.replyTo.fromMe === true ||
        String(payload.replyTo.id || "").startsWith("true_"),
    };
  }

  const data = payload._data || {};
  const ctx =
    data.ContextInfo ||
    data.contextInfo ||
    data.message?.extendedTextMessage?.contextInfo ||
    data.quotedMsg ||
    null;

  if (!ctx && !data.quotedStanzaID && !data.QuotedMsgId) return null;

  const stanzaId =
    ctx?.stanzaId ||
    ctx?.stanzaID ||
    data.quotedStanzaID ||
    data.QuotedMsgId ||
    null;
  const participant = ctx?.participant || data.quotedParticipant || null;
  const fromMe =
    Boolean(ctx?.fromMe) ||
    (participant && phonesMatch(participant, env.WAHA_BOT_PHONE));

  if (!stanzaId && !participant) return null;
  return {
    id: stanzaId ? String(stanzaId) : "",
    participant: participant ? String(participant) : null,
    body: ctx?.quotedMessage?.conversation || null,
    fromMe,
  };
}

/**
 * Coleta JIDs mencionados no payload WAHA (mentionedIds / mentions / @lid / contextInfo).
 * Não usa o texto da mensagem — só campos estruturados do envelope.
 */
export function extractMentionIds(payload) {
  const out = new Set();
  const lists = [
    payload.mentionIds,
    payload.mentionedIds,
    payload.mentionedJids,
    payload.mentions,
    payload._data?.mentionedJidList,
    payload._data?.mentionedJid,
    payload._data?.mentions,
    payload._data?.ContextInfo?.mentionedJid,
    payload._data?.contextInfo?.mentionedJid,
    payload._data?.message?.extendedTextMessage?.contextInfo?.mentionedJid,
    payload._data?.message?.extendedTextMessage?.contextInfo?.mentionedJidList,
  ];
  for (const list of lists) {
    if (!list) continue;
    const arr = Array.isArray(list) ? list : [list];
    for (const item of arr) {
      const jid =
        typeof item === "string"
          ? item
          : item?.id || item?._serialized || item?.jid || item?.user;
      if (jid) out.add(String(jid));
    }
  }
  return [...out];
}

/**
 * True se o JID mencionado (telefone @c.us / @lid / etc.) é a identidade do bot.
 */
export function mentionMatchesBot(mentionJid, botPhone, meId) {
  if (!mentionJid) return false;
  const mid = String(mentionJid);
  const midBase = mid.split("@")[0]?.split(":")[0] || "";

  if (meId) {
    const me = String(meId);
    if (mid === me) return true;
    const meBase = me.split("@")[0]?.split(":")[0] || "";
    if (midBase && meBase && midBase === meBase) return true;
    if (phonesMatch(mid, me) || phoneFromJid(mid) === phoneFromJid(me)) return true;
  }

  if (botPhone) {
    if (phonesMatch(mid, botPhone) || phoneFromJid(mid) === digitsOnly(botPhone)) {
      return true;
    }
  }

  return false;
}

/**
 * Remove prefixos de menção do texto pra obter a pergunta (após já ter
 * confirmado endereço via payload). Limpa @telefone e vestígios de @bot no body.
 */
export function stripBotAddressing(body, botPhone) {
  let text = String(body || "");
  const dig = digitsOnly(botPhone);
  if (dig) {
    // @5585… ou @85… (últimos dígitos comuns no WhatsApp)
    text = text.replace(new RegExp(`@${dig}\\b`, "gi"), " ");
    if (dig.length >= 8) {
      text = text.replace(new RegExp(`@${dig.slice(-8)}\\b`, "gi"), " ");
      text = text.replace(new RegExp(`@${dig.slice(-9)}\\b`, "gi"), " ");
    }
  }
  text = text.replace(/@\d{6,}\b/g, " ");
  text = text.replace(/\b@?bot\b/gi, " ");
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Interpreta o comando `resumo` (allowlist).
 * - `resumo` → só msgs ainda não incluídas num resumo anterior
 * - `resumo completo` / `de tudo` / `desde o início` / data explícita / `ontem`
 *   → inclui também as já marcadas (histórico pedido de forma explícita)
 *
 * Não casa frases ambíguas tipo "resumo do regulamento" (cai no RAG).
 *
 * @returns {null | { includeSummarized: boolean, day?: string }}
 */
export function parseResumoCommand(body, botPhone) {
  // stripBotAddressing pode deixar "@" solto quando casa só "bot" em "@bot".
  const cleaned = stripBotAddressing(body, botPhone)
    .toLowerCase()
    .replace(/@+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned.startsWith("resumo")) return null;

  const rest = cleaned.slice("resumo".length).trim();
  if (!rest) {
    return { includeSummarized: false };
  }

  // Data explícita YYYY-MM-DD → histórico pedido (inclui já marcadas daquele dia).
  const iso = rest.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) {
    return { includeSummarized: true, day: iso[1] };
  }

  if (/(^|\s)ontem\b/.test(rest)) {
    return { includeSummarized: true, day: offsetDayKey(-1) };
  }

  // Pedido explícito de histórico completo do dia atual.
  if (
    /^(de\s+)?tudo\b/.test(rest) ||
    /^(de\s+)?todas\b/.test(rest) ||
    /^completo\b/.test(rest) ||
    /^completa\b/.test(rest) ||
    /^integral\b/.test(rest) ||
    /^desde\s+o\s+in[ií]cio\b/.test(rest) ||
    /^do\s+dia\s*$/.test(rest)
  ) {
    return { includeSummarized: true };
  }

  return null;
}

export function isResumoCommand(body, botPhone) {
  return parseResumoCommand(body, botPhone) != null;
}

/** Dia civil Fortaleza com offset em dias (0 = hoje). */
function offsetDayKey(offsetDays) {
  const today = dayKey();
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + offsetDays);
  return dt.toISOString().slice(0, 10);
}

/**
 * No grupo: só responde se houver menção explícita no payload WAHA
 * (mentionedIds / mentions / @lid) ou reply a uma mensagem do bot.
 * NÃO dispara por substring "bot" / "@bot" no texto.
 * Em DM: qualquer mensagem (não fromMe) conta.
 */
export function isAddressedToBot(msg) {
  if (msg.fromMe) return false;
  if (!msg.isGroup) return true;

  const bot = msg.botPhone;
  for (const mid of msg.mentionIds || []) {
    if (mentionMatchesBot(mid, bot, msg.meId)) return true;
  }

  if (msg.replyTo?.fromMe) return true;
  if (msg.replyTo?.participant && mentionMatchesBot(msg.replyTo.participant, bot, msg.meId)) {
    return true;
  }

  return false;
}

export function isFantasy2Group(chatId) {
  const configured = String(env.WAHA_GROUP_ID || "").trim();
  if (!configured) return false;
  return String(chatId) === configured || String(chatId).startsWith(configured.split("@")[0]);
}
