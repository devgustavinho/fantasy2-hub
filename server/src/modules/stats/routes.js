import { Router } from "express";
import rateLimit from "express-rate-limit";
import { sqlite } from "../../db/client.js";
import { requireApproved, requireAuth, requireAdmin } from "../../auth/guards.js";

const VISITOR_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const visitLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

const countActiveTopics = sqlite.prepare(`
  SELECT COUNT(*) AS c FROM topics WHERE status = 'open'
`);

// Pessoas distintas que abriram o hub nas últimas 24h (rolling), com ou sem login.
const countVisitsLast24h = sqlite.prepare(`
  SELECT COUNT(*) AS c FROM hub_visits
  WHERE last_seen_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')
`);

const countAnonymousVisitsLast24h = sqlite.prepare(`
  SELECT COUNT(*) AS c FROM hub_visits
  WHERE last_seen_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')
    AND user_id IS NULL
`);

const listRecentNamedVisitors = sqlite.prepare(`
  SELECT
    u.id, u.name, u.email, u.role,
    v.last_seen_at AS lastLoginAt,
    a.tower, a.code AS apartmentCode
  FROM hub_visits v
  INNER JOIN users u ON u.id = v.user_id
  LEFT JOIN apartments a ON a.id = u.apartment_id
  WHERE v.last_seen_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')
  ORDER BY v.last_seen_at DESC
`);

const getVisit = sqlite.prepare(`SELECT visitor_id, user_id FROM hub_visits WHERE visitor_id = ?`);

const insertVisit = sqlite.prepare(`
  INSERT INTO hub_visits (visitor_id, user_id, first_seen_at, last_seen_at)
  VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
`);

const touchVisit = sqlite.prepare(`
  UPDATE hub_visits
  SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
      user_id = COALESCE(?, user_id)
  WHERE visitor_id = ?
`);

function visitsPayload() {
  const visitsLast24h = countVisitsLast24h.get().c;
  return {
    // Alias legado (MCP / front antigo): agora = visitas distintas, não só logins.
    loginsLast24h: visitsLast24h,
    visitsLast24h,
  };
}

export function statsRoutes() {
  const router = Router();

  // Beacon público: registra abertura do hub. Auth opcional (liga visitor → user).
  router.post("/visit", visitLimiter, (req, res) => {
    const raw = typeof req.body?.visitorId === "string" ? req.body.visitorId.trim() : "";
    if (!VISITOR_ID_RE.test(raw)) {
      return res.status(400).json({ message: "visitorId inválido." });
    }

    const userId = req.user?.id ?? null;
    const existing = getVisit.get(raw);
    if (existing) {
      touchVisit.run(userId, raw);
    } else {
      insertVisit.run(raw, userId);
    }

    res.status(204).end();
  });

  // Contadores da home — qualquer usuário aprovado.
  router.get("/home", requireAuth, requireApproved, (_req, res) => {
    res.json({
      activeTopics: countActiveTopics.get().c,
      ...visitsPayload(),
    });
  });

  // Visão admin do contador de acessos (mesmo número + lista de contas ligadas).
  // O front faz polling a cada 30 min.
  router.get("/admin/logins", requireAdmin, (_req, res) => {
    const visits = visitsPayload();
    const users = listRecentNamedVisitors.all();
    const anonymousVisitsLast24h = countAnonymousVisitsLast24h.get().c;
    res.json({
      ...visits,
      anonymousVisitsLast24h,
      users,
      refreshedAt: new Date().toISOString(),
    });
  });

  return router;
}
