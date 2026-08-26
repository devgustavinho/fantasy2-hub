import { randomUUID } from "node:crypto";
import { sqlite } from "../../db/client.js";

const getWatchers = sqlite.prepare(`
  SELECT created_by AS user_id FROM topics WHERE id = ?
  UNION
  SELECT user_id FROM votes WHERE topic_id = ?
  UNION
  SELECT user_id FROM comments WHERE topic_id = ?
`);

const insertNotification = sqlite.prepare(`
  INSERT INTO notifications (id, user_id, topic_id, message)
  VALUES (@id, @user_id, @topic_id, @message)
`);

// Notifica quem tem interesse na pauta (quem criou, votou ou comentou), exceto quem
// disparou a própria ação. Usado ao comentar, mudar status/agendamento, etc.
export function notifyTopicWatchers({ topicId, actorUserId, message }) {
  const watchers = getWatchers.all(topicId, topicId, topicId);
  const insertMany = sqlite.transaction((rows) => {
    for (const row of rows) {
      if (row.user_id === actorUserId) continue;
      insertNotification.run({ id: randomUUID(), user_id: row.user_id, topic_id: topicId, message });
    }
  });
  insertMany(watchers);
}
