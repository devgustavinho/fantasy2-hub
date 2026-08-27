import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { sqlite } from "../../db/client.js";
import { requireAuth, requireApproved, requireAdmin } from "../../auth/guards.js";
import { recordAudit } from "../audit/service.js";
import { processAndSaveImage } from "../../lib/media.js";

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
});

function handleImageUpload(req, res, next) {
  uploadImage.single("image")(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || "Erro no upload da imagem." });
    next();
  });
}

const nowIso = () => new Date().toISOString();

const faqSchema = z.object({
  question: z.string().trim().min(2).max(200),
  body: z.string().trim().min(1).max(20000),
});

const listFaq = sqlite.prepare(`
  SELECT f.id, f.question, f.body, f.created_at AS createdAt, f.updated_at AS updatedAt,
         f.created_by AS createdById, u.name AS createdByName
  FROM faq_entries f
  JOIN users u ON u.id = f.created_by
  ORDER BY f.created_at ASC
`);

const getFaqById = sqlite.prepare("SELECT * FROM faq_entries WHERE id = ?");

const insertFaq = sqlite.prepare(`
  INSERT INTO faq_entries (id, question, body, created_by)
  VALUES (@id, @question, @body, @created_by)
`);

const updateFaq = sqlite.prepare(`
  UPDATE faq_entries SET question = @question, body = @body, updated_at = @updated_at WHERE id = @id
`);

const deleteFaqById = sqlite.prepare("DELETE FROM faq_entries WHERE id = ?");

function serializeFaq(row) {
  return {
    id: row.id,
    question: row.question,
    body: row.body,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: { id: row.createdById, name: row.createdByName },
  };
}

export function faqRoutes() {
  const router = Router();
  router.use(requireAuth, requireApproved);

  router.get("/", (_req, res) => {
    res.json({ entries: listFaq.all().map(serializeFaq) });
  });

  router.post("/", requireAdmin, (req, res) => {
    const parsed = faqSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Preencha a pergunta e o texto da resposta." });
    }

    const id = randomUUID();
    insertFaq.run({ id, question: parsed.data.question, body: parsed.data.body, created_by: req.user.id });

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "faq.create",
      entityType: "faq_entry",
      entityId: id,
      details: { question: parsed.data.question },
    });

    res.status(201).json({ entries: listFaq.all().map(serializeFaq) });
  });

  router.patch("/:id", requireAdmin, (req, res) => {
    const entry = getFaqById.get(req.params.id);
    if (!entry) return res.status(404).json({ message: "Pergunta não encontrada." });

    const parsed = faqSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Preencha a pergunta e o texto da resposta." });
    }

    updateFaq.run({ id: entry.id, question: parsed.data.question, body: parsed.data.body, updated_at: nowIso() });

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "faq.edit",
      entityType: "faq_entry",
      entityId: entry.id,
    });

    res.json({ entries: listFaq.all().map(serializeFaq) });
  });

  router.delete("/:id", requireAdmin, (req, res) => {
    const entry = getFaqById.get(req.params.id);
    if (!entry) return res.status(404).json({ message: "Pergunta não encontrada." });

    deleteFaqById.run(entry.id);

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "faq.delete",
      entityType: "faq_entry",
      entityId: entry.id,
      details: { question: entry.question },
    });

    res.status(204).end();
  });

  // Upload de imagem pra inserir no corpo em markdown (`![](url)`) — não é um anexo separado
  // da pergunta, só devolve a URL pública pro front colar no texto.
  router.post("/images", requireAdmin, handleImageUpload, async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "Envie uma imagem." });

    try {
      const url = await processAndSaveImage(req.file.buffer, "faq");
      res.status(201).json({ url });
    } catch (err) {
      res.status(400).json({ message: "Não foi possível processar a imagem enviada." });
    }
  });

  return router;
}
