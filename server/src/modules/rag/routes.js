import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { requireAuth, requireApproved, requireStaff } from "../../auth/guards.js";
import { recordAudit } from "../audit/service.js";
import { askCondo, getIndexStatus } from "./ask.js";
import { reindexAll } from "./ingest.js";
import { isOpenAiConfigured } from "./openai.js";

const askSchema = z.object({
  question: z.string().trim().min(3).max(500),
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
    res.json({ ...status, available: status.openaiConfigured && status.chunks > 0, reindexRunning });
  });

  router.post("/ask", askLimiter, async (req, res) => {
    const parsed = askSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Escreva uma pergunta (3 a 500 caracteres)." });
    }

    try {
      const result = await askCondo(parsed.data.question);
      res.json(result);
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({
        message: err.message || "Não foi possível responder agora.",
      });
    }
  });

  router.post("/reindex", requireStaff, async (req, res) => {
    if (!isOpenAiConfigured()) {
      return res.status(503).json({
        message: "OPENAI_API_KEY não configurada no servidor.",
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
