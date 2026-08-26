import { randomUUID } from "node:crypto";
import { sqlite } from "../../db/client.js";
import { sendPushToUser } from "../push/service.js";

const getWatchers = sqlite.prepare(`
  SELECT created_by AS user_id FROM topics WHERE id = ?
  UNION
  SELECT user_id FROM votes WHERE topic_id = ?
  UNION
  SELECT user_id FROM comments WHERE topic_id = ?
`);

const getTopicTitle = sqlite.prepare("SELECT title FROM topics WHERE id = ?");

const insertNotification = sqlite.prepare(`
  INSERT INTO notifications (id, user_id, topic_id, message)
  VALUES (@id, @user_id, @topic_id, @message)
`);

// Notifica quem tem interesse na pauta (quem criou, votou ou comentou), exceto quem
// disparou a própria ação. Usado ao comentar, mudar status/agendamento, etc. O push é
// "fire and forget" (não bloqueia a resposta da rota) — falhas já são tratadas dentro de
// sendPushToUser, então não gera unhandled rejection.
export function notifyTopicWatchers({ topicId, actorUserId, message }) {
  const watchers = getWatchers.all(topicId, topicId, topicId);
  const recipients = watchers.map((row) => row.user_id).filter((id) => id !== actorUserId);

  const insertMany = sqlite.transaction((ids) => {
    for (const userId of ids) {
      insertNotification.run({ id: randomUUID(), user_id: userId, topic_id: topicId, message });
    }
  });
  insertMany(recipients);

  const topic = getTopicTitle.get(topicId);
  for (const userId of recipients) {
    sendPushToUser(userId, { title: topic?.title ?? "Fantasy 2 Hub", body: message, url: `/topics/${topicId}` });
  }
}

// Notifica um único usuário específico, sem depender de uma pauta ainda existir (ex.: aviso
// de que a própria pauta foi excluída — `topicId` fica null nesse caso).
export function notifyUser({ userId, topicId, message }) {
  insertNotification.run({ id: randomUUID(), user_id: userId, topic_id: topicId ?? null, message });
  sendPushToUser(userId, { title: "Fantasy 2 Hub", body: message, url: topicId ? `/topics/${topicId}` : "/" });
}
