import { Router } from "express";
import { sqlite } from "../../db/client.js";
import { requireAdmin } from "../../auth/guards.js";

const countAudit = sqlite.prepare(`
  SELECT COUNT(*) AS c FROM audit_log
  WHERE (@actorUserId IS NULL OR actor_user_id = @actorUserId)
`);

const listAuditPage = sqlite.prepare(`
  SELECT id, actor_user_id AS actorUserId, actor_name AS actorName, action,
         entity_type AS entityType, entity_id AS entityId, details, created_at AS createdAt
  FROM audit_log
  WHERE (@actorUserId IS NULL OR actor_user_id = @actorUserId)
  ORDER BY created_at DESC
  LIMIT @limit OFFSET @offset
`);

const listActors = sqlite.prepare(`
  SELECT DISTINCT actor_user_id AS id, actor_name AS name
  FROM audit_log
  WHERE actor_user_id IS NOT NULL
  ORDER BY actor_name ASC
`);

export function auditRoutes() {
  const router = Router();

  router.get("/", requireAdmin, (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));
    const actorUserId = req.query.actorUserId ? String(req.query.actorUserId) : null;

    const total = countAudit.get({ actorUserId }).c;
    const entries = listAuditPage
      .all({ actorUserId, limit: pageSize, offset: (page - 1) * pageSize })
      .map((row) => ({ ...row, details: row.details ? JSON.parse(row.details) : null }));

    res.json({ entries, total, page, pageSize });
  });

  router.get("/actors", requireAdmin, (_req, res) => {
    res.json({ actors: listActors.all() });
  });

  return router;
}
