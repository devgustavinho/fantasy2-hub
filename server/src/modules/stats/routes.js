import { Router } from "express";
import { sqlite } from "../../db/client.js";
import { requireApproved, requireAuth, requireAdmin } from "../../auth/guards.js";

const countActiveTopics = sqlite.prepare(`
  SELECT COUNT(*) AS c FROM topics WHERE status = 'open'
`);

const countLoginsLast24h = sqlite.prepare(`
  SELECT COUNT(*) AS c FROM users
  WHERE last_login_at IS NOT NULL
    AND last_login_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')
`);

const listRecentLogins = sqlite.prepare(`
  SELECT
    u.id, u.name, u.email, u.role, u.last_login_at AS lastLoginAt,
    a.tower, a.code AS apartmentCode
  FROM users u
  LEFT JOIN apartments a ON a.id = u.apartment_id
  WHERE u.last_login_at IS NOT NULL
    AND u.last_login_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')
  ORDER BY u.last_login_at DESC
`);

export function statsRoutes() {
  const router = Router();

  // Contadores da home — qualquer usuário aprovado.
  router.get("/home", requireAuth, requireApproved, (_req, res) => {
    res.json({
      activeTopics: countActiveTopics.get().c,
      loginsLast24h: countLoginsLast24h.get().c,
    });
  });

  // Visão admin do contador de logins (mesmo número + lista). O front faz polling a cada 30 min.
  router.get("/admin/logins", requireAdmin, (_req, res) => {
    const loginsLast24h = countLoginsLast24h.get().c;
    const users = listRecentLogins.all();
    res.json({
      loginsLast24h,
      users,
      refreshedAt: new Date().toISOString(),
    });
  });

  return router;
}
