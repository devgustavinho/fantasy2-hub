import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  PORT: z.coerce.number().default(3100),
  HOST: z.string().default("127.0.0.1"),
  DATABASE_PATH: z.string().default("./data/fantasy2.db"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET deve ter pelo menos 16 caracteres"),
  CORS_ORIGIN: z.string().min(1),
  VAPID_PUBLIC_KEY: z.string().min(1),
  VAPID_PRIVATE_KEY: z.string().min(1),
  VAPID_SUBJECT: z.string().min(1),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET_NAME: z.string().min(1),
  R2_PUBLIC_URL: z.string().url(),

  // E-mail transacional (Resend) — RESEND_API_KEY: resend.com/api-keys. EMAIL_FROM precisa ser um
  // endereço de um domínio verificado na conta Resend (resend.com/domains), formato
  // "Nome <remetente@dominio>".
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(1),

  // RAG (perguntas ao condomínio) — opcional: sem chave o servidor sobe, mas POST /rag/ask
  // e o reindex retornam 503 até configurar. Modelo de embedding: text-embedding-3-small.
  OPENAI_API_KEY: z.string().optional().default(""),

  // WAHA (bot WhatsApp do grupo Fantasy 2) — opcional. Sem WAHA_ENABLED=true o webhook
  // responde 503. Vars tipicamente espelham C:\Users\Gustavo\waha.env na VPS.
  WAHA_ENABLED: z
    .string()
    .optional()
    .default("false")
    .transform((v) => ["1", "true", "yes", "on"].includes(String(v).trim().toLowerCase())),
  WAHA_URL: z.string().optional().default(""),
  WAHA_API_KEY: z.string().optional().default(""),
  WAHA_SESSION: z.string().optional().default("default"),
  /** Número E.164 do bot, só dígitos (ex. 5585…). */
  WAHA_BOT_PHONE: z.string().optional().default(""),
  /**
   * LID do bot (`…@lid` ou só dígitos). Em grupos com addressing LID o
   * WhatsApp manda menções como @lid; sem isso (ou resolução via API)
   * o bot responde em DM mas ignora @menção no grupo.
   */
  WAHA_BOT_LID: z.string().optional().default(""),
  /** JID do grupo Fantasy 2 (`…@g.us`). */
  WAHA_GROUP_ID: z.string().optional().default(""),
  WAHA_GROUP_NAME: z.string().optional().default("Fantasy 2"),
  /** CSV de números (só dígitos) autorizados a mandar "resumo". */
  WAHA_SUMMARY_ALLOWLIST: z.string().optional().default(""),
  /** Se setado, exige header X-Webhook-Secret no POST /waha/webhook. */
  WAHA_WEBHOOK_SECRET: z.string().optional().default(""),
  WAHA_CHAT_DATA_DIR: z.string().optional().default("./data/waha-chats"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Variáveis de ambiente inválidas:");
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";

// Passkeys ficam amarradas ao domínio do front no momento do cadastro — se o CORS_ORIGIN
// mudar (ex. domínio customizado no lugar do *.pages.dev), passkeys antigas param de
// funcionar e os usuários precisam recadastrar.
export const webauthn = {
  rpID: new URL(env.CORS_ORIGIN).hostname,
  rpOrigin: env.CORS_ORIGIN,
  rpName: "Fantasy 2 Hub",
};
