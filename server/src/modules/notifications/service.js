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
  INSERT INTO notifications (id, user_id, topic_id, link_url, message)
  VALUES (@id, @user_id, @topic_id, @link_url, @message)
`);

// Notifica quem tem interesse na pauta (quem criou, votou ou comentou), exceto quem
// disparou a própria ação. Usado ao comentar, mudar status/agendamento, etc. O push é
// "fire and forget" (não bloqueia a resposta da rota) — falhas já são tratadas dentro de
// sendPushToUser, então não gera unhandled rejection.
export function notifyTopicWatchers({ topicId, actorUserId, message }) {
  const watchers = getWatchers.all(topicId, topicId, topicId);
  const recipients = watchers.map((row) => row.user_id).filter((id) => id !== actorUserId);
  const linkUrl = `/topics/${topicId}`;

  const insertMany = sqlite.transaction((ids) => {
    for (const userId of ids) {
      insertNotification.run({ id: randomUUID(), user_id: userId, topic_id: topicId, link_url: linkUrl, message });
    }
  });
  insertMany(recipients);

  const topic = getTopicTitle.get(topicId);
  for (const userId of recipients) {
    sendPushToUser(userId, { title: topic?.title ?? "Fantasy 2 Hub", body: message, url: linkUrl });
  }
}

// Notifica um único usuário específico, sem depender de uma pauta ainda existir (ex.: aviso
// de que a própria pauta foi excluída, ou de que o cadastro foi aprovado — `topicId` fica
// null nesses casos). `linkUrl` deixa explícito pra onde a notificação leva; sem isso, o front
// não tem como saber o destino de uma notificação sem pauta (virava sempre `/topics/null`).
export function notifyUser({ userId, topicId, linkUrl, message }) {
  const link = linkUrl ?? (topicId ? `/topics/${topicId}` : null);
  insertNotification.run({ id: randomUUID(), user_id: userId, topic_id: topicId ?? null, link_url: link, message });
  sendPushToUser(userId, { title: "Fantasy 2 Hub", body: message, url: link ?? "/" });
}

const getAdminIds = sqlite.prepare("SELECT id FROM users WHERE role = 'admin'");

// Notifica todos os admins atuais (pode ser mais de um) — usado quando alguém tenta se
// cadastrar, pra avisar que há uma aprovação pendente.
export function notifyAdmins({ message, url }) {
  const admins = getAdminIds.all();
  const linkUrl = url ?? "/admin/usuarios";
  const insertMany = sqlite.transaction((rows) => {
    for (const row of rows) {
      insertNotification.run({ id: randomUUID(), user_id: row.id, topic_id: null, link_url: linkUrl, message });
    }
  });
  insertMany(admins);

  for (const row of admins) {
    sendPushToUser(row.id, { title: "Fantasy 2 Hub", body: message, url: linkUrl });
  }
}
