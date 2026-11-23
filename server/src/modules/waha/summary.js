import { chatCompletion, isOpenAiConfigured } from "../rag/openai.js";
import {
  CHAT_TZ,
  countDayTextMessages,
  dayKey,
  listDayMessages,
  markMessagesSummarized,
} from "./chatStore.js";
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
 *
 * @param {{
 *   day?: string,
 *   includeSummarized?: boolean,
 * }} [opts]
 * @returns {Promise<{ text: string, marked: number, day: string, includeSummarized: boolean }>}
 */
export async function summarizeFantasy2Day(opts = {}) {
  const day = opts.day || dayKey();
  const includeSummarized = Boolean(opts.includeSummarized);

  if (!isOpenAiConfigured()) {
    const err = new Error(
      "Provedor de IA não configurado. Cadastre a API key em Perguntar (ou OPENAI_API_KEY).",
    );
    err.status = 503;
    throw err;
  }

  const counts = countDayTextMessages(day);
  const rows = listDayMessages(day, { includeSummarized }).filter(
    (r) => r.body && String(r.body).trim(),
  );

  if (rows.length === 0) {
    if (!includeSummarized && counts.total > 0) {
      return {
        text:
          `Não há mensagens novas do grupo ${env.WAHA_GROUP_NAME || "Fantasy 2"} em ${day} ` +
          `desde o último resumo. Diga "resumo completo" para incluir tudo do dia.`,
        marked: 0,
        day,
        includeSummarized,
      };
    }
    return {
      text: `Não há mensagens de texto registradas do grupo ${env.WAHA_GROUP_NAME || "Fantasy 2"} em ${day}.`,
      marked: 0,
      day,
      includeSummarized,
    };
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

  const text = await chatCompletion({
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

  // Marca as msgs efetivamente usadas neste resumo (não reentram no próximo
  // "resumo" padrão). Pedidos "completo"/data explícita também marcam.
  const marked = markMessagesSummarized(
    slice.map((r) => r.id),
    day,
  );

  let out = text;
  if (!includeSummarized && marked > 0) {
    out += `\n\n_(${marked} mensagem${marked === 1 ? "" : "ens"} marcada${marked === 1 ? "" : "s"} como lida${marked === 1 ? "" : "s"}.)_`;
  }

  return { text: out, marked, day, includeSummarized };
}
