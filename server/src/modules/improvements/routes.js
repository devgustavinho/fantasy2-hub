import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { sqlite } from "../../db/client.js";
import { requireAuth, requireApproved, requireStaff } from "../../auth/guards.js";
import { recordAudit } from "../audit/service.js";

const STATUSES = ["new", "reviewing", "in_progress", "done"];
const nowIso = () => new Date().toISOString();

const createSchema = z.object({
  title: z.string().trim().min(4).max(160),
  description: z.string().trim().min(4).max(2000),
});

const statusSchema = z.object({
  status: z.enum(STATUSES),
});

const listImprovements = sqlite.prepare(`
  SELECT
    i.id, i.title, i.description, i.status,
    i.created_at AS createdAt, i.updated_at AS updatedAt,
    i.created_by AS createdById, u.name AS createdByName
  FROM portal_improvements i
  JOIN users u ON u.id = i.created_by
  ORDER BY
    CASE i.status
      WHEN 'new' THEN 0
      WHEN 'reviewing' THEN 1
      WHEN 'in_progress' THEN 2
      WHEN 'done' THEN 3
    END,
    i.updated_at DESC
`);

const getById = sqlite.prepare(`
  SELECT
    i.id, i.title, i.description, i.status,
    i.created_at AS createdAt, i.updated_at AS updatedAt,
    i.created_by AS createdById, u.name AS createdByName
  FROM portal_improvements i
  JOIN users u ON u.id = i.created_by
  WHERE i.id = ?
`);

const insertImprovement = sqlite.prepare(`
  INSERT INTO portal_improvements (id, title, description, created_by)
  VALUES (@id, @title, @description, @created_by)
`);

const updateStatus = sqlite.prepare(`
  UPDATE portal_improvements SET status = @status, updated_at = @updated_at WHERE id = @id
`);

const deleteById = sqlite.prepare("DELETE FROM portal_improvements WHERE id = ?");

export function improvementsRoutes() {
  const router = Router();
  router.use(requireAuth, requireApproved);

  router.get("/", (_req, res) => {
    res.json({ improvements: listImprovements.all(), statuses: STATUSES });
  });

  router.post("/", (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Preencha título e descrição da melhoria." });
    }

    const id = randomUUID();
    insertImprovement.run({
      id,
      title: parsed.data.title,
      description: parsed.data.description,
      created_by: req.user.id,
    });

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "improvements.create",
      entityType: "portal_improvement",
      entityId: id,
      details: { title: parsed.data.title },
    });

    res.status(201).json({ improvement: getById.get(id) });
  });

  router.patch("/:id/status", requireStaff, (req, res) => {
    const row = getById.get(req.params.id);
    if (!row) return res.status(404).json({ message: "Melhoria não encontrada." });

    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Status inválido." });
    }

    updateStatus.run({ id: row.id, status: parsed.data.status, updated_at: nowIso() });

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "improvements.status",
      entityType: "portal_improvement",
      entityId: row.id,
      details: { from: row.status, to: parsed.data.status, title: row.title },
    });

    res.json({ improvement: getById.get(row.id) });
  });

  // Autor pode apagar só enquanto estiver "Nova"; staff apaga em qualquer status.
  router.delete("/:id", (req, res) => {
    const row = getById.get(req.params.id);
    if (!row) return res.status(404).json({ message: "Melhoria não encontrada." });

    const isStaff = req.user.role === "admin" || req.user.role === "sindico";
    const isAuthor = row.createdById === req.user.id;
    if (!isStaff && !(isAuthor && row.status === "new")) {
      return res.status(403).json({ message: "Você não pode excluir esta melhoria." });
    }

    deleteById.run(row.id);
    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "improvements.delete",
      entityType: "portal_improvement",
      entityId: row.id,
      details: { title: row.title, status: row.status },
    });
    res.status(204).end();
  });

  return router;
}
