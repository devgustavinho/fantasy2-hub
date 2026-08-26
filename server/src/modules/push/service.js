import webpush from "web-push";
import { sqlite } from "../../db/client.js";
import { env } from "../../env.js";

webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);

const getSubscriptionsByUser = sqlite.prepare(
  "SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?",
);

const deleteSubscription = sqlite.prepare("DELETE FROM push_subscriptions WHERE id = ?");

// Manda um push pra cada aparelho inscrito do usuário; se o navegador responder que a
// inscrição não existe mais (410/404), apaga do banco — expira naturalmente sozinha.
export async function sendPushToUser(userId, { title, body, url }) {
  const subscriptions = getSubscriptionsByUser.all(userId);
  const payload = JSON.stringify({ title, body, url });

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          deleteSubscription.run(sub.id);
        } else {
          console.error("push falhou:", err.statusCode, err.body);
        }
      }
    }),
  );
}
