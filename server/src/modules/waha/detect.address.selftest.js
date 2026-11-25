/**
 * Smoke puro: node src/modules/waha/detect.address.selftest.js
 *
 * Garante que o bot no grupo só responde a menção explícita no payload
 * (mentionedIds / @lid / reply), nunca à palavra "bot" no texto.
 */
function stubEnv() {
  const defaults = {
    JWT_SECRET: "1234567890123456",
    CORS_ORIGIN: "http://localhost:5173",
    VAPID_PUBLIC_KEY: "x",
    VAPID_PRIVATE_KEY: "x",
    VAPID_SUBJECT: "mailto:t@t.com",
    R2_ACCOUNT_ID: "x",
    R2_ACCESS_KEY_ID: "x",
    R2_SECRET_ACCESS_KEY: "x",
    R2_BUCKET_NAME: "x",
    R2_PUBLIC_URL: "https://example.com",
    RESEND_API_KEY: "x",
    EMAIL_FROM: "Test <t@example.com>",
    WAHA_BOT_PHONE: "5585999990000",
  };
  for (const [k, v] of Object.entries(defaults)) {
    if (!process.env[k]) process.env[k] = v;
  }
}

stubEnv();

const {
  extractMentionIds,
  isAddressedToBot,
  mentionMatchesBot,
  stripBotAddressing,
} = await import("./detect.js");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const bot = "5585999990000";
const meId = "5585999990000:21@c.us";
const lid = "123456789012345@lid";

assert(mentionMatchesBot(`${bot}@c.us`, bot, meId) === true, "mention phone@c.us");
assert(mentionMatchesBot(meId, bot, meId) === true, "mention meId exact");
assert(mentionMatchesBot(lid, bot, lid) === true, "mention @lid == meId");
assert(mentionMatchesBot("5585111111111@c.us", bot, meId) === false, "other phone");

assert(
  extractMentionIds({ mentionedIds: [`${bot}@c.us`] }).includes(`${bot}@c.us`),
  "extract mentionedIds",
);
assert(
  extractMentionIds({ mentions: [lid] }).includes(lid),
  "extract mentions (@lid)",
);
assert(
  extractMentionIds({
    _data: { message: { extendedTextMessage: { contextInfo: { mentionedJid: [meId] } } } },
  }).includes(meId),
  "extract contextInfo.mentionedJid",
);

const base = {
  fromMe: false,
  isGroup: true,
  body: "",
  botPhone: bot,
  meId,
  mentionIds: [],
  replyTo: null,
};

assert(
  isAddressedToBot({ ...base, body: "bot", mentionIds: [] }) === false,
  'palavra "bot" sozinha NÃO endereça',
);
assert(
  isAddressedToBot({ ...base, body: "oi bot tudo bem", mentionIds: [] }) === false,
  'substring "bot" NÃO endereça',
);
assert(
  isAddressedToBot({ ...base, body: "@bot qual o horário?", mentionIds: [] }) === false,
  "@bot só no texto (sem payload) NÃO endereça",
);
assert(
  isAddressedToBot({
    ...base,
    body: `@${bot} qual o horário?`,
    mentionIds: [],
  }) === false,
  "@telefone só no texto (sem payload) NÃO endereça",
);
assert(
  isAddressedToBot({
    ...base,
    body: "qual o horário da academia?",
    mentionIds: [`${bot}@c.us`],
  }) === true,
  "mentionedIds com telefone do bot → endereça",
);
assert(
  isAddressedToBot({
    ...base,
    body: "qual o horário?",
    mentionIds: [lid],
    meId: lid,
  }) === true,
  "menção @lid do bot → endereça",
);
assert(
  isAddressedToBot({
    ...base,
    body: "e aí?",
    mentionIds: [],
    replyTo: { fromMe: true, participant: meId },
  }) === true,
  "reply à mensagem do bot → endereça",
);
assert(
  isAddressedToBot({
    ...base,
    isGroup: false,
    body: "horário da academia?",
    mentionIds: [],
  }) === true,
  "DM → sempre endereça",
);
assert(
  isAddressedToBot({ ...base, fromMe: true, mentionIds: [`${bot}@c.us`] }) === false,
  "fromMe → nunca",
);

assert(
  stripBotAddressing(`@${bot} qual o horário?`, bot) === "qual o horário?",
  "strip @phone",
);
assert(stripBotAddressing("@bot resumo", bot).toLowerCase().includes("resumo"), "strip @bot");

console.log("waha detect.address.selftest: ok");
