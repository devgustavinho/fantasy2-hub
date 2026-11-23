import { env } from "../../env.js";
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

function extractMentionIds(payload) {
  const out = new Set();
  const lists = [
    payload.mentionIds,
    payload.mentionedIds,
    payload.mentionedJids,
    payload._data?.mentionedJidList,
    payload._data?.mentionedJid,
    payload._data?.ContextInfo?.mentionedJid,
    payload._data?.message?.extendedTextMessage?.contextInfo?.mentionedJid,
  ];
  for (const list of lists) {
    if (!list) continue;
    const arr = Array.isArray(list) ? list : [list];
    for (const item of arr) {
      const jid = typeof item === "string" ? item : item?.id || item?._serialized;
      if (jid) out.add(String(jid));
    }
  }
  return [...out];
}

/**
 * Remove menções / @bot do texto pra obter a pergunta.
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

export function isResumoCommand(body, botPhone) {
  const cleaned = stripBotAddressing(body, botPhone).toLowerCase();
  return cleaned === "resumo";
}

/**
 * No grupo: só responde se mencionar o bot, responder a ele, ou @bot no texto.
 * Em DM: qualquer mensagem (não fromMe) conta.
 */
export function isAddressedToBot(msg) {
  if (msg.fromMe) return false;
  if (!msg.isGroup) return true;

  const bot = msg.botPhone;
  if (bot) {
    for (const mid of msg.mentionIds) {
      if (phonesMatch(mid, bot) || phoneFromJid(mid) === bot) return true;
    }
    if (msg.meId && msg.mentionIds.some((m) => phonesMatch(m, msg.meId))) return true;
  }

  if (msg.replyTo?.fromMe) return true;
  if (msg.replyTo?.participant && bot && phonesMatch(msg.replyTo.participant, bot)) {
    return true;
  }

  const lower = String(msg.body || "").toLowerCase();
  if (/\b@?bot\b/i.test(lower)) return true;
  if (bot && lower.includes(`@${bot}`)) return true;
  if (bot && bot.length >= 8 && lower.includes(`@${bot.slice(-8)}`)) return true;

  return false;
}

export function isFantasy2Group(chatId) {
  const configured = String(env.WAHA_GROUP_ID || "").trim();
  if (!configured) return false;
  return String(chatId) === configured || String(chatId).startsWith(configured.split("@")[0]);
}
