import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sqlite } from "../../db/client.js";
import { getHorariosBundle } from "../horarios/service.js";
import { normalizeForIndex, prepareManualForIndex } from "./chunk.js";

const DAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANUAL_TXT = join(
  __dirname,
  "..",
  "..",
  "..",
  "assets",
  "docs",
  "manual-do-proprietario.txt",
);

const getFaq = sqlite.prepare("SELECT id, question, body FROM faq_entries WHERE id = ?");
const listFaq = sqlite.prepare("SELECT id, question, body FROM faq_entries");

const getWelcome = sqlite.prepare("SELECT title, body FROM welcome_page WHERE id = 1");

const getService = sqlite.prepare(`
  SELECT s.id, s.name, s.description, s.instagram, s.fulfillment_modes AS fulfillmentModes,
         s.slug, u.whatsapp AS whatsapp
  FROM condo_services s
  JOIN users u ON u.id = s.user_id
  WHERE s.id = ?
`);
const listServices = sqlite.prepare(`
  SELECT s.id, s.name, s.description, s.instagram, s.fulfillment_modes AS fulfillmentModes,
         s.slug, u.whatsapp AS whatsapp
  FROM condo_services s
  JOIN users u ON u.id = s.user_id
`);
const listServiceItems = sqlite.prepare(`
  SELECT name, description, price_cents AS priceCents, is_negotiable AS isNegotiable
  FROM condo_service_items WHERE service_id = ? ORDER BY created_at ASC
`);
const listServiceTags = sqlite.prepare(`
  SELECT t.name FROM service_tags st JOIN tags t ON t.id = st.tag_id
  WHERE st.service_id = ? ORDER BY t.name ASC
`);

const getRecommendation = sqlite.prepare(
  "SELECT id, name, description, whatsapp, instagram FROM recommendations WHERE id = ?",
);
const listRecommendations = sqlite.prepare(
  "SELECT id, name, description, whatsapp, instagram FROM recommendations",
);
const listRecommendationTags = sqlite.prepare(`
  SELECT t.name FROM recommendation_tags rt JOIN tags t ON t.id = rt.tag_id
  WHERE rt.recommendation_id = ? ORDER BY t.name ASC
`);

const getTopic = sqlite.prepare(`
  SELECT id, title, description, status, status_note AS statusNote,
         assembly_date AS assemblyDate, close_kind AS closeKind, close_reason AS closeReason
  FROM topics WHERE id = ?
`);
const listTopics = sqlite.prepare(`
  SELECT id, title, description, status, status_note AS statusNote,
         assembly_date AS assemblyDate, close_kind AS closeKind, close_reason AS closeReason
  FROM topics
`);
const listTopicEvents = sqlite.prepare(`
  SELECT message FROM topic_events WHERE topic_id = ? ORDER BY created_at ASC
`);

const listExternalEmbeds = sqlite.prepare(
  "SELECT id, title, body FROM rag_external_embeds ORDER BY created_at ASC",
);

function money(cents) {
  return `R$ ${(Number(cents) / 100).toFixed(2).replace(".", ",")}`;
}

/**
 * @returns {{ sourceType: string, sourceId: string, title: string, body: string } | null}
 */
export function buildFaqDocument(id) {
  const row = getFaq.get(id);
  if (!row) return null;
  const body = normalizeForIndex(`Pergunta: ${row.question}\n\nResposta:\n${row.body}`);
  return { sourceType: "faq", sourceId: row.id, title: row.question, body };
}

export function buildWelcomeDocument() {
  const row = getWelcome.get();
  if (!row) return null;
  const body = normalizeForIndex(`# ${row.title}\n\n${row.body}`);
  return { sourceType: "welcome", sourceId: "1", title: row.title, body };
}

const FULFILLMENT_LABELS = {
  door: "entrega na porta",
  pickup: "retirada no apartamento",
  lobby: "entrega na portaria",
  online: "serviço online",
};

function formatFulfillmentModes(raw) {
  let list = [];
  try {
    list = typeof raw === "string" ? JSON.parse(raw) : Array.isArray(raw) ? raw : [];
  } catch {
    list = [];
  }
  return list
    .map((m) => FULFILLMENT_LABELS[m])
    .filter(Boolean)
    .join(", ");
}

export function buildServiceDocument(id) {
  const row = getService.get(id);
  if (!row) return null;
  const tags = listServiceTags.all(id).map((t) => t.name);
  const items = listServiceItems.all(id);
  const modes = formatFulfillmentModes(row.fulfillmentModes);
  const lines = [
    `Negócio: ${row.name}`,
    row.description ? `Descrição: ${row.description}` : null,
    tags.length ? `Tags: ${tags.join(", ")}` : null,
    modes ? `Formas de atendimento: ${modes}` : null,
    row.slug ? `Link: /n/${row.slug}` : null,
    row.whatsapp ? `WhatsApp: ${row.whatsapp}` : null,
    row.instagram ? `Instagram: @${row.instagram}` : null,
  ].filter(Boolean);

  if (items.length) {
    lines.push("", "Itens:");
    for (const item of items) {
      const price = item.isNegotiable
        ? "preço a combinar"
        : money(item.priceCents);
      lines.push(
        `- ${item.name} (${price})${item.description ? `: ${item.description}` : ""}`,
      );
    }
  }

  return {
    sourceType: "service",
    sourceId: row.id,
    title: row.name,
    body: normalizeForIndex(lines.join("\n")),
  };
}

export function buildRecommendationDocument(id) {
  const row = getRecommendation.get(id);
  if (!row) return null;
  let tags = [];
  try {
    tags = listRecommendationTags.all(id).map((t) => t.name);
  } catch {
    // tabela de tags de recomendação pode não existir em DBs muito antigos — ignore
  }
  const lines = [
    `Recomendação: ${row.name}`,
    row.description ? `Descrição: ${row.description}` : null,
    tags.length ? `Tags: ${tags.join(", ")}` : null,
    row.whatsapp ? `WhatsApp: ${row.whatsapp}` : null,
    row.instagram ? `Instagram: @${row.instagram}` : null,
  ].filter(Boolean);

  return {
    sourceType: "recommendation",
    sourceId: row.id,
    title: row.name,
    body: normalizeForIndex(lines.join("\n")),
  };
}

const CLOSE_KIND_LABEL = {
  debated: "debatida em assembleia",
  not_scheduled: "não pautada",
};

export function buildTopicDocument(id) {
  const row = getTopic.get(id);
  if (!row) return null;
  const events = listTopicEvents.all(id).map((e) => e.message);
  const lines = [
    `Pauta: ${row.title}`,
    `Status: ${row.status}`,
    row.assemblyDate ? `Data da assembleia: ${row.assemblyDate}` : null,
    `Descrição:\n${row.description}`,
    row.statusNote ? `Atualização da administração:\n${row.statusNote}` : null,
    row.closeKind
      ? `Encerramento (${CLOSE_KIND_LABEL[row.closeKind] || row.closeKind}): ${row.closeReason}`
      : null,
  ].filter(Boolean);

  if (events.length) {
    lines.push("", "Histórico oficial:");
    for (const msg of events) lines.push(`- ${msg}`);
  }

  return {
    sourceType: "topic",
    sourceId: row.id,
    title: row.title,
    body: normalizeForIndex(lines.join("\n")),
  };
}

export function buildExternalDocumentFromRow(row) {
  if (!row) return null;
  const body = normalizeForIndex(`# ${row.title}\n\n${row.body}`);
  if (!body) return null;
  return { sourceType: "external", sourceId: row.id, title: row.title, body };
}

/** Manual do Proprietário — texto pré-extraído do PDF em assets/docs. */
export function buildManualDocument() {
  if (!existsSync(MANUAL_TXT)) return null;
  const raw = readFileSync(MANUAL_TXT, "utf8");
  const body = prepareManualForIndex(raw);
  if (!body) return null;
  return {
    sourceType: "manual",
    sourceId: "proprietario",
    title: "Manual do Proprietário — Fantasy 2",
    body,
  };
}

function formatDays(days) {
  return (days || [])
    .map((d) => DAY_NAMES[Number(d)] || String(d))
    .filter(Boolean)
    .join(", ");
}

/**
 * Horários do condomínio para o RAG — convivência/silêncio, áreas e mudança.
 * Nunca inclui senha de Wi‑Fi (nem SSID sensível demais; só marca se tem Wi‑Fi).
 */
export function buildHorariosDocuments() {
  let bundle;
  try {
    bundle = getHorariosBundle();
  } catch {
    return [];
  }
  if (!bundle) return [];

  const docs = [];
  const noiseUntil = bundle.convivencia?.noiseUntil;
  if (noiseUntil) {
    const ref = bundle.convivencia.assemblyRef
      ? `\nReferência de assembleia: ${bundle.convivencia.assemblyRef}`
      : "";
    docs.push({
      sourceType: "horarios",
      sourceId: "convivencia",
      title: "Horário de silêncio / convivência",
      body: normalizeForIndex(
        `Convivência e silêncio no Fantasy 2 (fuso America/Fortaleza).\n` +
          `Barulho permitido até ${noiseUntil}. A partir de ${noiseUntil} vale o horário de silêncio.` +
          ref,
      ),
    });
  }

  const areaLines = ["Áreas comuns — horários de funcionamento:"];
  for (const area of bundle.areas || []) {
    const hours = area.is24h
      ? "aberta 24 horas"
      : area.opensAt && area.closesAt
        ? `${area.opensAt} às ${area.closesAt}`
        : "horário não informado";
    const bits = [`- ${area.name}: ${hours}`];
    if (area.notes) bits.push(`Notas: ${area.notes}`);
    if (area.assemblyRef) bits.push(`Assembleia: ${area.assemblyRef}`);
    if (area.hasWifi) bits.push("Possui Wi‑Fi (credenciais no Hub / tool get_area_wifi).");
    areaLines.push(bits.join(". "));
  }
  if ((bundle.areas || []).length) {
    docs.push({
      sourceType: "horarios",
      sourceId: "areas",
      title: "Horários das áreas comuns",
      body: normalizeForIndex(areaLines.join("\n")),
    });
  }

  const mudanca = bundle.mudanca;
  if (mudanca) {
    const lines = [
      "Janelas de mudança (entrada/saída de móveis) — Fantasy 2, fuso America/Fortaleza:",
    ];
    for (const w of mudanca.windows || []) {
      lines.push(`- ${formatDays(w.days)}: ${w.opensAt} às ${w.closesAt}`);
    }
    if (mudanca.assemblyRef) lines.push(`Referência de assembleia: ${mudanca.assemblyRef}`);
    const blocked = mudanca.blockedDays || [];
    if (blocked.length) {
      lines.push("", "Dias bloqueados para mudança (próximos):");
      for (const d of blocked.slice(0, 40)) {
        lines.push(`- ${d.date}: ${d.reason}${d.source ? ` (${d.source})` : ""}`);
      }
    }
    docs.push({
      sourceType: "horarios",
      sourceId: "mudanca",
      title: "Janelas de mudança",
      body: normalizeForIndex(lines.join("\n")),
    });
  }

  return docs.filter((d) => d.body);
}

export function listAllSourceDocuments() {
  const docs = [];
  for (const row of listFaq.all()) {
    const d = buildFaqDocument(row.id);
    if (d) docs.push(d);
  }
  const welcome = buildWelcomeDocument();
  if (welcome) docs.push(welcome);
  for (const row of listServices.all()) {
    const d = buildServiceDocument(row.id);
    if (d) docs.push(d);
  }
  for (const row of listRecommendations.all()) {
    const d = buildRecommendationDocument(row.id);
    if (d) docs.push(d);
  }
  for (const row of listTopics.all()) {
    const d = buildTopicDocument(row.id);
    if (d) docs.push(d);
  }
  for (const row of listExternalEmbeds.all()) {
    const d = buildExternalDocumentFromRow(row);
    if (d) docs.push(d);
  }
  const manual = buildManualDocument();
  if (manual) docs.push(manual);
  for (const d of buildHorariosDocuments()) docs.push(d);
  return docs;
}
