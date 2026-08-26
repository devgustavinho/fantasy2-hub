import { Router } from "express";
import { sqlite } from "../../db/client.js";
import { requireAdmin } from "../../auth/guards.js";

const listAudit = sqlite.prepare(`
  SELECT id, actor_user_id AS actorUserId, actor_name AS actorName, action,
         entity_type AS entityType, entity_id AS entityId, details, created_at AS createdAt
  FROM audit_log
  ORDER BY created_at DESC
  LIMIT 200
`);

export function auditRoutes() {
  const router = Router();

  router.get("/", requireAdmin, (_req, res) => {
    const entries = listAudit.all().map((row) => ({
      ...row,
      details: row.details ? JSON.parse(row.details) : null,
    }));
    res.json({ entries });
  });

  return router;
}
