import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { requireAuth, requireApproved, requireStaff, requireConselheiro } from "../../auth/guards.js";
import { deleteFromR2 } from "../../lib/r2.js";
import { savePdf } from "../../lib/media.js";
import { recordAudit } from "../audit/service.js";
import { notifyCounselors } from "../notifications/service.js";
import {
  listBalancetes,
  buildDetail,
  publishBalancete,
  saveParecer,
  findParecerForCounselor,
  deleteBalancete,
} from "./service.js";

const uploadPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, cb) {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Envie um arquivo PDF."));
    }
    cb(null, true);
  },
});

function handlePdfUpload(req, res, next) {
  uploadPdf.single("pdf")(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || "Erro no upload do PDF." });
    next();
  });
}

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês inválido (YYYY-MM).");

const obsSchema = z.object({
  tipo: z.enum(["ressalva", "conferido", "pendencia"]),
  body: z.string().trim().min(1).max(2000),
});

const parecerSchema = z.object({
  decision: z.enum(["aprovado", "aprovado_ressalvas", "reprovado"]),
  observacoes: z.array(obsSchema).max(20).default([]),
  finalize: z.boolean().default(false),
});

/**
 * Contábil (balancetes):
 * - GET list/detail: qualquer aprovado (morador, conselheiro, staff).
 * - POST/DELETE: só staff (admin/síndico membership + 2FA) via requireStaff.
 * - PUT parecer: só conselheiro membership + 2FA via requireConselheiro.
 * A UI exclusiviza por role ativa; a API mantém membership (padrão do Hub).
 */
export function contabilRoutes() {
  const router = Router();
  router.use(requireAuth, requireApproved);

  // Leitura — morador inclusive (lista, detalhe, PDF).
  router.get("/", (_req, res) => {
    res.json({ balancetes: listBalancetes() });
  });

  router.get("/:id", (req, res) => {
    const detail = buildDetail(req.params.id, req.user);
    if (!detail) return res.status(404).json({ message: "Balancete não encontrado." });
    res.json(detail);
  });

  // Publicar — só staff (admin / síndico).
  router.post("/", requireStaff, handlePdfUpload, async (req, res) => {
    const referenceMonth = typeof req.body?.referenceMonth === "string" ? req.body.referenceMonth.trim() : "";
    const parsedMonth = monthSchema.safeParse(referenceMonth);
    if (!parsedMonth.success) {
      return res.status(400).json({ message: "Informe o mês de referência (AAAA-MM)." });
    }
    if (!req.file) {
      return res.status(400).json({ message: "Anexe o PDF do balancete." });
    }

    let pdfUrl;
    try {
      pdfUrl = await savePdf(req.file.buffer, "balancetes");
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Falha ao enviar o PDF." });
    }

    try {
      const balancete = publishBalancete({
        referenceMonth: parsedMonth.data,
        pdfUrl,
        publishedBy: req.user.id,
      });

      recordAudit({
        actorUserId: req.user.id,
        actorName: req.user.name,
        action: "contabil.publish",
        entityType: "balancete",
        entityId: balancete.id,
        details: { referenceMonth: balancete.referenceMonth, title: balancete.title },
      });

      notifyCounselors({
        message: `${balancete.title} foi publicado e aguarda seu parecer.`,
        url: `/contabil/${balancete.id}`,
      });

      res.status(201).json({ balancete });
    } catch (err) {
      deleteFromR2(pdfUrl);
      if (String(err?.message || "").includes("UNIQUE")) {
        return res.status(409).json({ message: "Já existe balancete para este mês." });
      }
      console.error(err);
      return res.status(500).json({ message: "Não foi possível publicar o balancete." });
    }
  });

  // Parecer — só conselheiro (não morador, não staff sem cargo de conselheiro).
  router.put("/:id/parecer", requireConselheiro, (req, res) => {
    const parsed = parecerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Escolha a decisão e preencha as observações." });
    }

    const mine = findParecerForCounselor(req.params.id, req.user.id);
    if (!mine) {
      return res.status(404).json({ message: "Você não está na análise deste balancete." });
    }

    const result = saveParecer({
      parecerId: mine.id,
      decision: parsed.data.decision,
      observacoes: parsed.data.observacoes,
      finalize: parsed.data.finalize,
    });

    if (result.error === "already_finalized") {
      return res.status(409).json({ message: "Este parecer já foi finalizado." });
    }
    if (result.error) {
      return res.status(404).json({ message: "Parecer não encontrado." });
    }

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: parsed.data.finalize ? "contabil.parecer.finalize" : "contabil.parecer.draft",
      entityType: "balancete_parecer",
      entityId: mine.id,
      details: {
        balanceteId: req.params.id,
        decision: parsed.data.decision,
        observacoes: parsed.data.observacoes.length,
      },
    });

    const detail = buildDetail(req.params.id, req.user);
    res.json(detail);
  });

  // Excluir — só staff.
  router.delete("/:id", requireStaff, (req, res) => {
    const row = deleteBalancete(req.params.id);
    if (!row) return res.status(404).json({ message: "Balancete não encontrado." });

    deleteFromR2(row.pdfUrl);
    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "contabil.delete",
      entityType: "balancete",
      entityId: row.id,
      details: { referenceMonth: row.referenceMonth, title: row.title },
    });
    res.status(204).end();
  });

  return router;
}
