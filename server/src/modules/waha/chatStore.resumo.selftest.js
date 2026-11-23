/**
 * Smoke: node src/modules/waha/chatStore.resumo.selftest.js
 * Usa dir temporário em /tmp — não toca data/ de produção.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function stubEnv(chatDir) {
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
    WAHA_CHAT_DATA_DIR: chatDir,
  };
  for (const [k, v] of Object.entries(defaults)) {
    process.env[k] = v;
  }
}

const dir = mkdtempSync(join(tmpdir(), "waha-resumo-"));
stubEnv(dir);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

try {
  const {
    appendGroupMessage,
    countDayTextMessages,
    dayKey,
    listDayMessages,
    markMessagesSummarized,
  } = await import("./chatStore.js");

  const day = dayKey();
  const now = Math.floor(Date.now() / 1000);

  appendGroupMessage({
    id: "m1",
    timestamp: now,
    chatId: "g@g.us",
    senderPhone: "5585111",
    pushName: "A",
    body: "primeira",
  });
  appendGroupMessage({
    id: "m2",
    timestamp: now + 1,
    chatId: "g@g.us",
    senderPhone: "5585222",
    pushName: "B",
    body: "segunda",
  });
  appendGroupMessage({
    id: "m3",
    timestamp: now + 2,
    chatId: "g@g.us",
    senderPhone: "5585333",
    pushName: "C",
    body: "",
  });

  assert(listDayMessages(day).length === 3, "lista todas unread");
  assert(countDayTextMessages(day).total === 2, "só texto conta");
  assert(countDayTextMessages(day).unread === 2, "unread texto");

  const marked = markMessagesSummarized(["m1"], day);
  assert(marked === 1, "marcou 1");
  assert(listDayMessages(day).map((r) => r.id).join(",") === "m2,m3", "exclui m1");
  assert(
    listDayMessages(day, { includeSummarized: true }).map((r) => r.id).join(",") ===
      "m1,m2,m3",
    "includeSummarized traz m1",
  );
  assert(countDayTextMessages(day).unread === 1, "unread caiu pra 1");

  // Idempotente: remarcar m1 não mexe.
  assert(markMessagesSummarized(["m1"], day) === 0, "já marcada → 0");

  // Migração: coluna existe em DB novo (já exercitada via append).
  console.log("waha chatStore.resumo.selftest: ok");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
