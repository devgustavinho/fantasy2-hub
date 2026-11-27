import { Router } from "express";
import { env } from "../../env.js";
import { isWahaConfigured } from "./client.js";
import { handleWahaEvent } from "./handler.js";

export function wahaRoutes() {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({
      ok: true,
      enabled: Boolean(env.WAHA_ENABLED),
      configured: isWahaConfigured(),
      session: env.WAHA_SESSION || null,
      groupConfigured: Boolean(env.WAHA_GROUP_ID),
      botPhoneConfigured: Boolean(String(env.WAHA_BOT_PHONE || "").trim()),
      botLidConfigured: Boolean(String(env.WAHA_BOT_LID || "").trim()),
      summaryAllowlistConfigured: Boolean(String(env.WAHA_SUMMARY_ALLOWLIST || "").trim()),
    });
  });

  /**
   * Webhook WAHA — aponte events `message` e `message.any` para esta URL.
   * Persistência do grupo: ambos. Replies RAG/resumo: só `message` + claim por
   * message id (evita cota/resposta duplicada). Sempre 200; processamento async.
   */
  router.post("/webhook", (req, res) => {
    if (!env.WAHA_ENABLED) {
      return res.status(503).json({ message: "WAHA desabilitado (WAHA_ENABLED)." });
    }
    if (!isWahaConfigured()) {
      return res.status(503).json({ message: "WAHA incompleto: defina WAHA_URL e WAHA_API_KEY." });
    }

    if (env.WAHA_WEBHOOK_SECRET) {
      const got = req.get("X-Webhook-Secret") || req.get("x-webhook-secret") || "";
      if (got !== env.WAHA_WEBHOOK_SECRET) {
        return res.status(401).json({ message: "Webhook secret inválido." });
      }
    }

    const event = req.body;
    res.status(200).json({ ok: true });

    setImmediate(() => {
      handleWahaEvent(event).catch((err) => {
        console.error("[waha] handler error:", err);
      });
    });
  });

  return router;
}
