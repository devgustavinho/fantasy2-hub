import { Router } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { z } from "zod";
import { requireAuth, requireApproved, requireAdmin, requireStaff } from "../../auth/guards.js";
import { recordAudit } from "../audit/service.js";
import { askCondo, getIndexStatus } from "./ask.js";
import {
  createExternalEmbed,
  deleteExternalEmbed,
  isAllowedTextFilename,
  listExternalEmbedsPublic,
  MAX_BODY_CHARS,
} from "./embeds.js";
import { reindexAll } from "./ingest.js";
import { isOpenAiConfigured } from "./openai.js";
import { quotaPayload, releaseAskSlot, reserveAskSlot } from "./quota.js";
import { clearRagApiKey, getRagSettingsPublic, saveRagSettings } from "./settings.js";

const uploadText = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BODY_CHARS, files: 1 },
});

function handleTextUpload(req, res, next) {
  uploadText.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || "Erro no upload." });
    next();
  });
}

const askSchema = z.object({
  question: z.string().trim().min(3).max(500),
});

const settingsSchema = z.object({
  provider: z.enum(["openai"]),
  apiKey: z.string().trim().min(16).max(200),
});

const askLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Muitas perguntas em pouco tempo. Aguarde um minuto." },
});

let reindexRunning = false;

export function ragRoutes() {
  const router = Router();
  router.use(requireAuth, requireApproved);

  router.get("/status", (req, res) => {
    const status = getIndexStatus();
    // Morador vê só se está disponível; staff vê contagens.
    const isStaff = req.user.role === "admin" || req.user.role === "sindico";
    if (!isStaff) {
      return res.json({
        available: status.openaiConfigured && status.chunks > 0,
        openaiConfigured: status.openaiConfigured,
      });
    }
    res.json({
      ...status,
      available: status.openaiConfigured && status.chunks > 0,
      reindexRunning,
      settings: getRagSettingsPublic(),
    });
  });

  // Metadados do provedor — nunca devolve a API key (só configured/source).
  router.get("/settings", requireAdmin, (_req, res) => {
    res.json(getRagSettingsPublic());
  });

  router.put("/settings", requireAdmin, (req, res) => {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Informe o provedor e uma API key válida." });
    }

    try {
      const settings = saveRagSettings({
        provider: parsed.data.provider,
        apiKey: parsed.data.apiKey,
        actorUserId: req.user.id,
      });
      recordAudit({
        actorUserId: req.user.id,
        actorName: req.user.name,
        action: "rag.settings_save",
        entityType: "rag_settings",
        entityId: "1",
        details: { provider: parsed.data.provider, configured: true },
      });
      // Resposta sem a key — só status.
      res.json(settings);
    } catch (err) {
      res.status(err.status || 500).json({ message: err.message || "Não foi possível salvar." });
    }
  });

  router.delete("/settings", requireAdmin, (req, res) => {
    const settings = clearRagApiKey({ actorUserId: req.user.id });
    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "rag.settings_clear",
      entityType: "rag_settings",
      entityId: "1",
      details: { configured: settings.configured },
    });
    res.json(settings);
  });

  // Embeds externos (texto) — só admin; corpo nunca é listado de volta na listagem.
  router.get("/embeds", requireAdmin, (_req, res) => {
    res.json({ embeds: listExternalEmbedsPublic() });
  });

  router.post("/embeds", requireAdmin, handleTextUpload, async (req, res) => {
    try {
      let title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
      let body = typeof req.body?.body === "string" ? req.body.body : "";
      let filename = null;

      if (req.file) {
        filename = req.file.originalname || "arquivo.txt";
        if (!isAllowedTextFilename(filename)) {
          return res.status(400).json({
            message: "Só texto por enquanto (.txt, .md, .markdown, .csv, .log).",
          });
        }
        body = req.file.buffer.toString("utf8");
        if (!title) title = filename.replace(/\.[^.]+$/, "");
      }

      if (!String(body || "").trim()) {
        return res.status(400).json({ message: "Envie um arquivo de texto ou o campo body." });
      }

      const result = await createExternalEmbed({
        title,
        filename,
        body,
        actorUserId: req.user.id,
      });

      recordAudit({
        actorUserId: req.user.id,
        actorName: req.user.name,
        action: "rag.embed_create",
        entityType: "rag_external_embed",
        entityId: result.embed.id,
        details: { title: result.embed.title, filename, chunks: result.indexed?.chunks },
      });

      res.status(201).json({
        embed: result.embed,
        status: getIndexStatus(),
      });
    } catch (err) {
      res.status(err.status || 500).json({ message: err.message || "Falha ao indexar o embed." });
    }
  });

  router.delete("/embeds/:id", requireAdmin, async (req, res) => {
    try {
      await deleteExternalEmbed(req.params.id);
      recordAudit({
        actorUserId: req.user.id,
        actorName: req.user.name,
        action: "rag.embed_delete",
        entityType: "rag_external_embed",
        entityId: req.params.id,
      });
      res.json({ ok: true, status: getIndexStatus() });
    } catch (err) {
      res.status(err.status || 500).json({ message: err.message || "Falha ao remover." });
    }
  });

  router.post("/ask", askLimiter, async (req, res) => {
    const parsed = askSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Escreva uma pergunta (3 a 500 caracteres)." });
    }

    let reservedId = null;
    try {
      // Cota por usuário (5 / 24h) — MCP usa a mesma rota, então herda o limite.
      const reserved = reserveAskSlot(req.user.id);
      reservedId = reserved.id;

      const result = await askCondo(parsed.data.question);
      const quota = quotaPayload(reserved.quota);
      res.setHeader("X-RateLimit-Limit", String(quota.limit));
      res.setHeader("X-RateLimit-Remaining", String(quota.remaining));
      if (quota.resetAt) res.setHeader("X-RateLimit-Reset", quota.resetAt);
      res.json({ ...result, quota });
    } catch (err) {
      if (reservedId) releaseAskSlot(reservedId);
      const status = err.status || 500;
      const body = {
        message: err.message || "Não foi possível responder agora.",
      };
      if (err.quota) {
        body.limit = err.quota.limit;
        body.remaining = err.quota.remaining;
        body.resetAt = err.quota.resetAt;
        res.setHeader("X-RateLimit-Limit", String(err.quota.limit));
        res.setHeader("X-RateLimit-Remaining", String(err.quota.remaining));
        if (err.quota.resetAt) res.setHeader("X-RateLimit-Reset", err.quota.resetAt);
      }
      res.status(status).json(body);
    }
  });

  router.post("/reindex", requireStaff, async (req, res) => {
    if (!isOpenAiConfigured()) {
      return res.status(503).json({
        message: "Provedor de IA não configurado. Cadastre a API key (Admin → Perguntar).",
      });
    }
    if (reindexRunning) {
      return res.status(409).json({ message: "Reindexação já em andamento." });
    }

    const force = Boolean(req.body?.force);
    reindexRunning = true;

    try {
      const result = await reindexAll({ force });
      recordAudit({
        actorUserId: req.user.id,
        actorName: req.user.name,
        action: "rag.reindex",
        entityType: "rag_index",
        entityId: "all",
        details: {
          force,
          total: result.total,
          upserted: result.upserted,
          skipped: result.skipped,
          errors: result.errors,
        },
      });
      res.json({ ...result, status: getIndexStatus() });
    } catch (err) {
      res.status(500).json({ message: err.message || "Falha ao reindexar." });
    } finally {
      reindexRunning = false;
    }
  });

  return router;
}
