import { env } from "../../env.js";
import { askCondo } from "../rag/ask.js";
import { claimInboundMessage } from "./claim.js";
import { sendText, isWahaConfigured } from "./client.js";
import { appendGroupMessage } from "./chatStore.js";
import {
  isAddressedToBot,
  isFantasy2Group,
  mentionMatchesBot,
  normalizeEvent,
  parseResumoCommand,
  stripBotAddressing,
} from "./detect.js";
import { resolveBotLid, resolveLidToPhone } from "./lids.js";
import { isAllowlisted, phonesMatch } from "./phones.js";
import { quotaPayload, releaseWahaAskSlot, reserveWahaAskSlot } from "./quota.js";
import { summarizeFantasy2Day } from "./summary.js";

/**
 * Grupo: menção pode vir só como @lid (WhatsApp LID addressing).
 * Completa botLid via API/env e, se preciso, resolve cada @lid → telefone.
 */
async function isAddressedToBotResolved(msg) {
  if (isAddressedToBot(msg)) return true;
  if (!msg.isGroup || msg.fromMe) return false;

  const botLid = msg.botLid || (await resolveBotLid());
  if (botLid) {
    const withLid = { ...msg, botLid };
    if (isAddressedToBot(withLid)) return true;
  }

  for (const mid of msg.mentionIds || []) {
    if (!String(mid).endsWith("@lid")) continue;
    if (mentionMatchesBot(mid, msg.botPhone, msg.meId, botLid)) return true;
    const pn = await resolveLidToPhone(mid);
    if (pn && msg.botPhone && phonesMatch(pn, msg.botPhone)) return true;
  }

  return false;
}

/**
 * Processa um evento WAHA (message / message.any).
 *
 * Persistência do grupo: ambos os eventos (`message.any` inclui fromMe).
 * Respostas (RAG / resumo): claim atômico por message id + cota UNIQUE(message_id).
 * O WAHA com `message`+`message.any` entrega o mesmo inbound 2×; sem dedupe
 * o bot respondia duas vezes e cobrava 2 cotas ("Restam 3" depois "Restam 4").
 *
 * @param {object} event
 */
export async function handleWahaEvent(event) {
  if (!isWahaConfigured()) return { skipped: "disabled" };

  const name = String(event?.event || "");
  if (name !== "message" && name !== "message.any") {
    return { skipped: "event" };
  }

  // Sessão diferente da configurada — ignora.
  if (event.session && env.WAHA_SESSION && event.session !== env.WAHA_SESSION) {
    return { skipped: "session" };
  }

  const msg = normalizeEvent(event);
  if (!msg.id || !msg.chatId) return { skipped: "empty" };

  const storedGroup = isFantasy2Group(msg.chatId);

  // Persistência: só o grupo Fantasy 2 (todas as msgs, incl. fromMe) — ambos os eventos.
  if (storedGroup) {
    appendGroupMessage({
      id: msg.id,
      timestamp: msg.timestamp,
      chatId: msg.chatId,
      senderJid: msg.senderJid,
      senderPhone: msg.senderPhone,
      pushName: msg.pushName,
      body: msg.body,
      fromMe: msg.fromMe,
      hasMedia: msg.hasMedia,
      raw: { id: msg.id, from: msg.chatId, participant: msg.senderJid },
    });
  }

  // Não responde às próprias mensagens.
  if (msg.fromMe) return { skipped: "fromMe", stored: storedGroup };

  // Replies (RAG/resumo) só no evento `message`.
  // `message.any` duplica todo inbound e continua necessário pra persistir fromMe;
  // claim por id abaixo ainda cobre retry do próprio `message`.
  if (name === "message.any") {
    return { skipped: "message.any_no_reply", stored: storedGroup };
  }

  // Comando resumo — Gustavo (allowlist), em qualquer chat.
  const resumoCmd = parseResumoCommand(msg.body, msg.botPhone);
  if (resumoCmd) {
    if (!isAllowlisted(msg.senderPhone, env.WAHA_SUMMARY_ALLOWLIST)) {
      // Silêncio pra não vazar o comando a quem não pode usar.
      return { skipped: "resumo_denied" };
    }
    if (!claimInboundMessage(msg.id, "resumo")) {
      return { skipped: "duplicate" };
    }
    try {
      const summary = await summarizeFantasy2Day({
        day: resumoCmd.day,
        includeSummarized: resumoCmd.includeSummarized,
      });
      await sendText({
        chatId: msg.chatId,
        text: summary.text,
        replyTo: msg.id,
      });
      return {
        ok: true,
        action: "resumo",
        marked: summary.marked,
        includeSummarized: summary.includeSummarized,
      };
    } catch (err) {
      await sendText({
        chatId: msg.chatId,
        text: err.message || "Não consegui gerar o resumo agora.",
        replyTo: msg.id,
      }).catch(() => {});
      return { ok: false, action: "resumo", error: err.message };
    }
  }

  // Perguntas RAG: no grupo Fantasy 2 (com menção/reply) ou DM ao bot.
  const inFantasyGroup = storedGroup;
  const isDm = !msg.isGroup;
  if (!inFantasyGroup && !isDm) {
    console.info("[waha] skip other_chat", {
      chatId: msg.chatId,
      configuredGroup: env.WAHA_GROUP_ID || null,
    });
    return { skipped: "other_chat" };
  }

  const addressed = isDm ? true : await isAddressedToBotResolved(msg);
  if (inFantasyGroup && !addressed) {
    console.info("[waha] skip not_addressed", {
      chatId: msg.chatId,
      mentionIds: msg.mentionIds,
      hasReply: Boolean(msg.replyTo),
      botPhone: msg.botPhone || null,
      meId: msg.meId || null,
      botLid: msg.botLid || null,
    });
    return { skipped: "not_addressed" };
  }

  const question = stripBotAddressing(msg.body, msg.botPhone);
  if (!question || question.length < 3) {
    if (isDm || addressed) {
      if (!claimInboundMessage(msg.id, "short")) {
        return { skipped: "duplicate" };
      }
      await sendText({
        chatId: msg.chatId,
        text: "Me chama com uma pergunta (menciona o bot no grupo, ex.: @Bot horário da academia?).",
        replyTo: msg.id,
      }).catch(() => {});
    }
    return { skipped: "short" };
  }

  // Claim antes da cota/ask — message e message.any competem; só o 1º segue.
  if (!claimInboundMessage(msg.id, "ask")) {
    return { skipped: "duplicate" };
  }

  const phone = msg.senderPhone || "unknown";
  let reservedId = null;
  try {
    const reserved = reserveWahaAskSlot(phone, msg.id);
    if (reserved.duplicate) {
      return { skipped: "duplicate_quota" };
    }
    reservedId = reserved.id;

    const result = await askCondo(question);
    const quota = quotaPayload(reserved.quota);
    let text = result.answer;
    if (quota.remaining === 0) {
      text += `\n\n_(Limite de ${quota.limit} perguntas / 24h atingido.)_`;
    } else {
      text += `\n\n_(Restam ${quota.remaining} de ${quota.limit} perguntas nas próximas 24h.)_`;
    }

    await sendText({
      chatId: msg.chatId,
      text,
      replyTo: msg.id,
    });
    return { ok: true, action: "ask", remaining: quota.remaining };
  } catch (err) {
    if (reservedId) releaseWahaAskSlot(reservedId);
    const text = err.message || "Não consegui responder agora.";
    await sendText({
      chatId: msg.chatId,
      text,
      replyTo: msg.id,
    }).catch(() => {});
    return { ok: false, action: "ask", error: err.message, status: err.status };
  }
}
