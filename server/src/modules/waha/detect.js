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
  // WAHA/GOWS pode expor o LID do próprio bot em me.lid (issue #1015).
  const meLid = event?.me?.lid
    ? String(event.me.lid)
    : event?.me?.Lid
      ? String(event.me.Lid)
      : "";
  const botPhone = digitsOnly(env.WAHA_BOT_PHONE) || phoneFromJid(meId);
  const botLidEnvRaw = String(env.WAHA_BOT_LID || "").trim();
  const botLidFromEnv = botLidEnvRaw
    ? botLidEnvRaw.includes("@")
      ? botLidEnvRaw
      : `${digitsOnly(botLidEnvRaw)}@lid`
    : "";
  const botLid = botLidFromEnv || meLid;

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
    meLid,
    botLid,
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
 * Cobre NOWEB (camelCase) e GOWS (PascalCase / Info.Message).
 */
export function extractMentionIds(payload) {
  const out = new Set();
  const data = payload._data || {};
  const extCtx =
    data.message?.extendedTextMessage?.contextInfo ||
    data.Message?.extendedTextMessage?.contextInfo ||
    data.Message?.ExtendedTextMessage?.ContextInfo ||
    data.Info?.Message?.extendedTextMessage?.contextInfo ||
    data.Info?.Message?.ExtendedTextMessage?.ContextInfo ||
    null;
  const lists = [
    payload.mentionIds,
    payload.mentionedIds,
    payload.mentionedJids,
    payload.mentions,
    data.mentionedJidList,
    data.mentionedJid,
    data.MentionedJid,
    data.mentions,
    data.ContextInfo?.mentionedJid,
    data.ContextInfo?.MentionedJid,
    data.contextInfo?.mentionedJid,
    data.contextInfo?.MentionedJid,
    extCtx?.mentionedJid,
    extCtx?.mentionedJidList,
    extCtx?.MentionedJid,
    extCtx?.MentionedJidList,
  ];
  for (const list of lists) {
    if (!list) continue;
    const arr = Array.isArray(list) ? list : [list];
    for (const item of arr) {
      const jid =
        typeof item === "string"
          ? item
          : item?.id || item?._serialized || item?.jid || item?.user || item?.JID || item?.Lid;
      if (jid) out.add(String(jid));
    }
  }
  return [...out];
}

/**
 * True se o JID mencionado (telefone @c.us / @lid / etc.) é a identidade do bot.
 * @param {string} mentionJid
 * @param {string} botPhone
 * @param {string} meId
 * @param {string} [botLid] LID conhecido do bot (`…@lid`)
 */
export function mentionMatchesBot(mentionJid, botPhone, meId, botLid = "") {
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

  if (botLid) {
    const lid = String(botLid);
    if (mid === lid) return true;
    const lidBase = lid.split("@")[0]?.split(":")[0] || "";
    if (midBase && lidBase && midBase === lidBase) return true;
  }

  if (botPhone) {
    // Menção @lid NÃO casa com telefone por dígitos — LIDs não são E.164.
    if (mid.endsWith("@lid")) return false;
    if (phonesMatch(mid, botPhone) || phoneFromJid(mid) === digitsOnly(botPhone)) {
      return true;
    }
  }

  return false;
}

/**
 * @telefone / @últimos-dígitos no body — menção explícita quando o payload
 * não traz mentionedIds (engines incompletos). Não casa a palavra "bot".
 */
export function bodyMentionsBotPhone(body, botPhone, botLid = "") {
  const text = String(body || "");
  const dig = digitsOnly(botPhone);
  if (dig) {
    if (new RegExp(`@${dig}\\b`, "i").test(text)) return true;
    if (dig.length >= 8 && new RegExp(`@${dig.slice(-8)}\\b`, "i").test(text)) return true;
    if (dig.length >= 9 && new RegExp(`@${dig.slice(-9)}\\b`, "i").test(text)) return true;
  }
  const lidDig = digitsOnly(botLid) || (String(botLid).includes("@lid") ? phoneFromJid(botLid) : "");
  if (lidDig && new RegExp(`@${lidDig}\\b`, "i").test(text)) return true;
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
 * (mentionedIds / mentions / @lid) — incluindo LID do bot —, @telefone/@lid
 * no body, ou reply a uma mensagem do bot.
 * NÃO dispara por substring "bot" / "@bot" no texto sem marcar o contato.
 * Em DM: qualquer mensagem (não fromMe) conta.
 */
export function isAddressedToBot(msg) {
  if (msg.fromMe) return false;
  if (!msg.isGroup) return true;

  const bot = msg.botPhone;
  const botLid = msg.botLid || msg.meLid || "";
  for (const mid of msg.mentionIds || []) {
    if (mentionMatchesBot(mid, bot, msg.meId, botLid)) return true;
  }

  if (msg.replyTo?.fromMe) return true;
  if (
    msg.replyTo?.participant &&
    mentionMatchesBot(msg.replyTo.participant, bot, msg.meId, botLid)
  ) {
    return true;
  }

  if (bodyMentionsBotPhone(msg.body, bot, botLid)) return true;

  return false;
}

export function isFantasy2Group(chatId) {
  const configured = String(env.WAHA_GROUP_ID || "").trim();
  if (!configured) return false;
  return String(chatId) === configured || String(chatId).startsWith(configured.split("@")[0]);
}
