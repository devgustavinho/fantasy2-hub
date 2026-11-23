import { env } from "../../env.js";
import { askCondo } from "../rag/ask.js";
import { sendText, isWahaConfigured } from "./client.js";
import { appendGroupMessage } from "./chatStore.js";
import {
  isAddressedToBot,
  isFantasy2Group,
  isResumoCommand,
  normalizeEvent,
  stripBotAddressing,
} from "./detect.js";
import { isAllowlisted } from "./phones.js";
import { quotaPayload, releaseWahaAskSlot, reserveWahaAskSlot } from "./quota.js";
import { summarizeFantasy2Day } from "./summary.js";

/**
 * Processa um evento WAHA (message / message.any).
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

  // Persistência: só o grupo Fantasy 2 (todas as msgs, incl. fromMe).
  if (isFantasy2Group(msg.chatId)) {
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
  if (msg.fromMe) return { skipped: "fromMe", stored: isFantasy2Group(msg.chatId) };

  // Comando resumo — Gustavo (allowlist), em qualquer chat.
  if (isResumoCommand(msg.body, msg.botPhone)) {
    if (!isAllowlisted(msg.senderPhone, env.WAHA_SUMMARY_ALLOWLIST)) {
      // Silêncio pra não vazar o comando a quem não pode usar.
      return { skipped: "resumo_denied" };
    }
    try {
      const summary = await summarizeFantasy2Day();
      await sendText({
        chatId: msg.chatId,
        text: summary,
        replyTo: msg.id,
      });
      return { ok: true, action: "resumo" };
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
  const inFantasyGroup = isFantasy2Group(msg.chatId);
  const isDm = !msg.isGroup;
  if (!inFantasyGroup && !isDm) {
    return { skipped: "other_chat" };
  }
  if (inFantasyGroup && !isAddressedToBot(msg)) {
    return { skipped: "not_addressed" };
  }

  const question = stripBotAddressing(msg.body, msg.botPhone);
  if (!question || question.length < 3) {
    if (isDm || isAddressedToBot(msg)) {
      await sendText({
        chatId: msg.chatId,
        text: "Me chama com uma pergunta (ex.: @bot qual o horário da academia?).",
        replyTo: msg.id,
      }).catch(() => {});
    }
    return { skipped: "short" };
  }

  const phone = msg.senderPhone || "unknown";
  let reservedId = null;
  try {
    const reserved = reserveWahaAskSlot(phone);
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
