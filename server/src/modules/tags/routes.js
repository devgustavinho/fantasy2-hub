import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { sqlite } from "../../db/client.js";
import { requireAuth, requireApproved, requireAdmin } from "../../auth/guards.js";
import { recordAudit } from "../audit/service.js";

const tagSchema = z.object({ name: z.string().trim().min(2).max(40) });

const listTags = sqlite.prepare("SELECT id, name FROM tags ORDER BY name ASC");
const getTagById = sqlite.prepare("SELECT id, name FROM tags WHERE id = ?");
const getTagByName = sqlite.prepare("SELECT id FROM tags WHERE name = ? COLLATE NOCASE");
const insertTag = sqlite.prepare("INSERT INTO tags (id, name) VALUES (?, ?)");
const deleteTagById = sqlite.prepare("DELETE FROM tags WHERE id = ?");

export function tagsRoutes() {
  const router = Router();
  router.use(requireAuth, requireApproved);

  router.get("/", (_req, res) => {
    res.json({ tags: listTags.all() });
  });

  router.post("/", requireAdmin, (req, res) => {
    const parsed = tagSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Informe um nome de tag válido." });

    if (getTagByName.get(parsed.data.name)) {
      return res.status(409).json({ message: "Já existe uma tag com esse nome." });
    }

    const id = randomUUID();
    insertTag.run(id, parsed.data.name);
    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "tags.create",
      entityType: "tag",
      entityId: id,
      details: { name: parsed.data.name },
    });
    res.status(201).json({ tag: { id, name: parsed.data.name } });
  });

  router.delete("/:id", requireAdmin, (req, res) => {
    const tag = getTagById.get(req.params.id);
    if (!tag) return res.status(404).json({ message: "Tag não encontrada." });

    deleteTagById.run(tag.id);
    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "tags.delete",
      entityType: "tag",
      entityId: tag.id,
      details: { name: tag.name },
    });
    res.status(204).end();
  });

  return router;
}
