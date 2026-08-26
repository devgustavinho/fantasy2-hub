import { Router } from "express";
import { sqlite } from "../../db/client.js";
import { requireApproved, requireAuth } from "../../auth/guards.js";

const nowIso = () => new Date().toISOString();

const listMine = sqlite.prepare(`
  SELECT n.id, n.topic_id AS topicId, t.title AS topicTitle, n.message,
         n.read_at AS readAt, n.created_at AS createdAt
  FROM notifications n
  LEFT JOIN topics t ON t.id = n.topic_id
  WHERE n.user_id = ?
  ORDER BY n.created_at DESC
  LIMIT 50
`);

const countUnread = sqlite.prepare(
  "SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL",
);

const markOneRead = sqlite.prepare(
  "UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL",
);

const markAllRead = sqlite.prepare(
  "UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL",
);

export function notificationsRoutes() {
  const router = Router();
  router.use(requireAuth, requireApproved);

  router.get("/", (req, res) => {
    res.json({
      notifications: listMine.all(req.user.id),
      unreadCount: countUnread.get(req.user.id).c,
    });
  });

  router.post("/read-all", (req, res) => {
    markAllRead.run(nowIso(), req.user.id);
    res.status(204).end();
  });

  router.post("/:id/read", (req, res) => {
    markOneRead.run(nowIso(), req.params.id, req.user.id);
    res.status(204).end();
  });

  return router;
}
