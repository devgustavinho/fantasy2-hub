import { chatCompletion, isOpenAiConfigured } from "../rag/openai.js";
import { CHAT_TZ, dayKey, listDayMessages } from "./chatStore.js";
import { env } from "../../env.js";

function formatClock(tsSec) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: CHAT_TZ,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(tsSec * 1000));
  } catch {
    return "";
  }
}

/**
 * Resume o chat do grupo Fantasy 2 no dia (fuso America/Fortaleza).
 * @param {string} [day]
 */
export async function summarizeFantasy2Day(day = dayKey()) {
  if (!isOpenAiConfigured()) {
    const err = new Error(
      "Provedor de IA não configurado. Cadastre a API key em Perguntar (ou OPENAI_API_KEY).",
    );
    err.status = 503;
    throw err;
  }

  const rows = listDayMessages(day).filter((r) => r.body && String(r.body).trim());
  if (rows.length === 0) {
    return `Não há mensagens de texto registradas do grupo ${env.WAHA_GROUP_NAME || "Fantasy 2"} em ${day}.`;
  }

  // Limita tamanho pra não estourar contexto — prioriza o fim do dia.
  const maxLines = 400;
  const slice = rows.length > maxLines ? rows.slice(-maxLines) : rows;
  const transcript = slice
    .map((r) => {
      const who = r.fromMe
        ? "Bot"
        : r.pushName || r.senderPhone || "alguém";
      const time = formatClock(r.ts);
      return `[${time}] ${who}: ${String(r.body).replace(/\s+/g, " ").trim()}`;
    })
    .join("\n");

  return chatCompletion({
    temperature: 0.3,
    max_tokens: 900,
    messages: [
      {
        role: "system",
        content:
          "Você resume o grupo de WhatsApp do condomínio Fantasy 2. " +
          "Responda em português do Brasil, em tópicos curtos (bullet points). " +
          "Destaque decisões, avisos, perguntas em aberto e clima geral. " +
          "Não invente fatos que não estejam no transcript. Se houver pouco conteúdo, diga isso.",
      },
      {
        role: "user",
        content: `Dia ${day} (fuso ${CHAT_TZ}). Transcript do grupo "${env.WAHA_GROUP_NAME || "Fantasy 2"}":\n\n${transcript}`,
      },
    ],
  });
}
