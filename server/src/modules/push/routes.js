import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { sqlite } from "../../db/client.js";
import { env } from "../../env.js";
import { requireApproved, requireAuth } from "../../auth/guards.js";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

const upsertSubscription = sqlite.prepare(`
  INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth)
  VALUES (@id, @user_id, @endpoint, @p256dh, @auth)
  ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth
`);

const deleteByEndpoint = sqlite.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?");

export function pushRoutes() {
  const router = Router();

  router.get("/vapid-public-key", (_req, res) => {
    res.json({ publicKey: env.VAPID_PUBLIC_KEY });
  });

  router.post("/subscribe", requireAuth, requireApproved, (req, res) => {
    const parsed = subscribeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Inscrição inválida." });

    upsertSubscription.run({
      id: randomUUID(),
      user_id: req.user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
    });
    res.status(201).end();
  });

  router.delete("/subscribe", requireAuth, (req, res) => {
    const parsed = unsubscribeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Informe o endpoint." });

    deleteByEndpoint.run(parsed.data.endpoint);
    res.status(204).end();
  });

  return router;
}
