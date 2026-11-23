/**
 * Smoke: node src/modules/waha/detect.resumo.selftest.js
 * (define stubs de env antes do import — env.js valida no load.)
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

const { parseResumoCommand, isResumoCommand } = await import("./detect.js");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const bot = "5585999990000";

assert(parseResumoCommand("resumo", bot)?.includeSummarized === false, "resumo → unread only");
assert(parseResumoCommand("Resumo", bot)?.includeSummarized === false, "Resumo case");
assert(parseResumoCommand("@bot resumo", bot)?.includeSummarized === false, "@bot resumo");
assert(parseResumoCommand("resumo completo", bot)?.includeSummarized === true, "completo");
assert(parseResumoCommand("resumo de tudo", bot)?.includeSummarized === true, "de tudo");
assert(parseResumoCommand("resumo desde o início", bot)?.includeSummarized === true, "desde o início");
assert(parseResumoCommand("resumo desde o inicio", bot)?.includeSummarized === true, "desde o inicio");
assert(parseResumoCommand("resumo 2026-03-20", bot)?.day === "2026-03-20", "data explícita");
assert(parseResumoCommand("resumo 2026-03-20", bot)?.includeSummarized === true, "data inclui marcadas");
assert(parseResumoCommand("resumo ontem", bot)?.includeSummarized === true, "ontem");
assert(parseResumoCommand("resumo ontem", bot)?.day != null, "ontem tem day");
assert(parseResumoCommand("resumo do regulamento", bot) == null, "não rouba RAG");
assert(parseResumoCommand("oi", bot) == null, "não é resumo");
assert(isResumoCommand("resumo", bot) === true, "isResumoCommand yes");
assert(isResumoCommand("resumo completo", bot) === true, "isResumoCommand completo");
assert(isResumoCommand("resumo do regulamento", bot) === false, "isResumoCommand RAG");

console.log("waha detect.resumo.selftest: ok");
