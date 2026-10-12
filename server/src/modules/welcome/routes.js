import { Router } from "express";
import multer from "multer";
import QRCode from "qrcode";
import { z } from "zod";
import { sqlite } from "../../db/client.js";
import { env } from "../../env.js";
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

const welcomeSchema = z.object({
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(1).max(50000),
});

const getWelcome = sqlite.prepare(`
  SELECT title, body, updated_at AS updatedAt
  FROM welcome_page
  WHERE id = 1
`);

const updateWelcome = sqlite.prepare(`
  UPDATE welcome_page
  SET title = @title, body = @body, updated_at = @updated_at, updated_by = @updated_by
  WHERE id = 1
`);

function publicUrl() {
  return `${env.CORS_ORIGIN.replace(/\/+$/, "")}/boas-vindas`;
}

export function welcomeRoutes() {
  const router = Router();

  // Página lida no elevador, sem login. O QR só aponta pra cá.
  router.get("/", (_req, res) => {
    const page = getWelcome.get();
    if (!page) return res.status(404).json({ message: "Página de boas-vindas ainda não foi configurada." });
    res.json(page);
  });

  router.get("/qr", requireAuth, requireApproved, requireAdmin, async (_req, res) => {
    try {
      const url = publicUrl();
      const dataUrl = await QRCode.toDataURL(url, {
        width: 640,
        margin: 2,
        errorCorrectionLevel: "M",
      });
      res.json({ url, dataUrl });
    } catch {
      res.status(500).json({ message: "Não foi possível gerar o QR Code." });
    }
  });

  router.put("/", requireAuth, requireApproved, requireAdmin, (req, res) => {
    const current = getWelcome.get();
    if (!current) return res.status(404).json({ message: "Página de boas-vindas ainda não foi configurada." });

    const parsed = welcomeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Preencha o título e o texto da página." });
    }

    updateWelcome.run({
      title: parsed.data.title,
      body: parsed.data.body,
      updated_at: nowIso(),
      updated_by: req.user.id,
    });

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "welcome.edit",
      entityType: "welcome_page",
      entityId: "1",
      details: { title: parsed.data.title },
    });

    res.json(getWelcome.get());
  });

  router.post("/images", requireAuth, requireApproved, requireAdmin, handleImageUpload, async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "Envie uma imagem." });

    try {
      const url = await processAndSaveImage(req.file.buffer, "welcome");
      res.status(201).json({ url });
    } catch {
      res.status(400).json({ message: "Não foi possível processar a imagem enviada." });
    }
  });

  return router;
}
