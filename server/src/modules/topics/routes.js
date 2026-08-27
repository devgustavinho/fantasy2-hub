import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { sqlite } from "../../db/client.js";
import { requireApproved, requireAuth, requireStaff } from "../../auth/guards.js";
import { notifyTopicWatchers, notifyUser } from "../notifications/service.js";
import { recordAudit } from "../audit/service.js";

const nowIso = () => new Date().toISOString();

const createSchema = z.object({
  title: z.string().trim().min(4).max(160),
  description: z.string().trim().min(4).max(4000),
});

const editSchema = createSchema;

const voteSchema = z.object({
  value: z.enum(["favor", "contra"]),
});

const commentSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

const patchSchema = z.object({
  assemblyDate: z.string().trim().min(1).nullable(),
});

const statusNoteSchema = z.object({
  note: z.string().trim().min(1).max(500).nullable(),
});

const deleteSchema = z.object({
  reason: z.string().trim().min(10, "O motivo precisa ter pelo menos 10 caracteres."),
});

const listTopics = sqlite.prepare(`
  SELECT
    t.id, t.title, t.description, t.status, t.assembly_date AS assemblyDate,
    t.status_note AS statusNote,
    t.created_at AS createdAt, t.updated_at AS updatedAt,
    u.name AS createdByName,
    COALESCE(SUM(CASE WHEN v.value = 'favor' THEN 1 ELSE 0 END), 0) AS favorCount,
    COALESCE(SUM(CASE WHEN v.value = 'contra' THEN 1 ELSE 0 END), 0) AS contraCount,
    (SELECT COUNT(*) FROM comments c WHERE c.topic_id = t.id) AS commentCount
  FROM topics t
  JOIN users u ON u.id = t.created_by
  LEFT JOIN votes v ON v.topic_id = t.id
  GROUP BY t.id
  ORDER BY t.created_at DESC
`);

const getTopic = sqlite.prepare(`
  SELECT
    t.id, t.title, t.description, t.status, t.assembly_date AS assemblyDate,
    t.status_note AS statusNote,
    t.created_at AS createdAt, t.updated_at AS updatedAt,
    t.created_by AS createdById, u.name AS createdByName
  FROM topics t
  JOIN users u ON u.id = t.created_by
  WHERE t.id = ?
`);

const getVoteCounts = sqlite.prepare(`
  SELECT
    COALESCE(SUM(CASE WHEN value = 'favor' THEN 1 ELSE 0 END), 0) AS favorCount,
    COALESCE(SUM(CASE WHEN value = 'contra' THEN 1 ELSE 0 END), 0) AS contraCount
  FROM votes WHERE topic_id = ?
`);

const getMyVote = sqlite.prepare("SELECT value FROM votes WHERE topic_id = ? AND user_id = ?");

const listComments = sqlite.prepare(`
  SELECT c.id, c.body, c.created_at AS createdAt, c.updated_at AS updatedAt,
         c.user_id AS authorId, u.name AS authorName, u.role AS authorRole
  FROM comments c
  JOIN users u ON u.id = c.user_id
  WHERE c.topic_id = ?
  ORDER BY c.created_at ASC
`);

const getCommentById = sqlite.prepare("SELECT id, topic_id, user_id FROM comments WHERE id = ?");
const updateComment = sqlite.prepare("UPDATE comments SET body = @body, updated_at = @updated_at WHERE id = @id");

const listEvents = sqlite.prepare(`
  SELECT e.id, e.message, e.created_at AS createdAt
  FROM topic_events e
  WHERE e.topic_id = ?
  ORDER BY e.created_at ASC
`);

const insertTopic = sqlite.prepare(`
  INSERT INTO topics (id, title, description, created_by)
  VALUES (@id, @title, @description, @created_by)
`);

const updateTopicSchedule = sqlite.prepare(`
  UPDATE topics SET status = @status, assembly_date = @assembly_date, updated_at = @updated_at
  WHERE id = @id
`);

const updateTopicContent = sqlite.prepare(`
  UPDATE topics SET title = @title, description = @description, updated_at = @updated_at
  WHERE id = @id
`);

const updateStatusNote = sqlite.prepare(`
  UPDATE topics SET status_note = @status_note, updated_at = @updated_at WHERE id = @id
`);

const insertEvent = sqlite.prepare(`
  INSERT INTO topic_events (id, topic_id, actor_user_id, message)
  VALUES (@id, @topic_id, @actor_user_id, @message)
`);

function recordEvent(topicId, actorUserId, message) {
  insertEvent.run({ id: randomUUID(), topic_id: topicId, actor_user_id: actorUserId, message });
}

const upsertVote = sqlite.prepare(`
  INSERT INTO votes (id, topic_id, user_id, value)
  VALUES (@id, @topic_id, @user_id, @value)
  ON CONFLICT(topic_id, user_id) DO UPDATE SET value = excluded.value, updated_at = @updated_at
`);

const insertComment = sqlite.prepare(`
  INSERT INTO comments (id, topic_id, user_id, body)
  VALUES (@id, @topic_id, @user_id, @body)
`);

const deleteVotesByTopic = sqlite.prepare("DELETE FROM votes WHERE topic_id = ?");
const deleteCommentsByTopic = sqlite.prepare("DELETE FROM comments WHERE topic_id = ?");
const deleteEventsByTopic = sqlite.prepare("DELETE FROM topic_events WHERE topic_id = ?");
const deleteNotificationsByTopic = sqlite.prepare("DELETE FROM notifications WHERE topic_id = ?");
const deleteTopicById = sqlite.prepare("DELETE FROM topics WHERE id = ?");

// SQLite não cascateia sozinho — apaga tudo que referencia a pauta antes dela mesma, numa
// transação (ou tudo ou nada).
const deleteTopicCascade = sqlite.transaction((topicId) => {
  deleteVotesByTopic.run(topicId);
  deleteCommentsByTopic.run(topicId);
  deleteEventsByTopic.run(topicId);
  deleteNotificationsByTopic.run(topicId);
  deleteTopicById.run(topicId);
});

export function topicsRoutes() {
  const router = Router();
  router.use(requireAuth, requireApproved);

  router.get("/", (_req, res) => {
    const rows = listTopics.all().map((row) => ({
      ...row,
      favorCount: Number(row.favorCount),
      contraCount: Number(row.contraCount),
      commentCount: Number(row.commentCount),
    }));
    res.json({ topics: rows });
  });

  router.post("/", (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Preencha título e descrição da pauta." });
    }
    const id = randomUUID();
    insertTopic.run({ id, ...parsed.data, created_by: req.user.id });
    recordEvent(id, req.user.id, `${req.user.name} criou a pauta`);
    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "topics.create",
      entityType: "topic",
      entityId: id,
      details: { title: parsed.data.title },
    });
    res.status(201).json({ topic: getTopic.get(id) });
  });

  router.get("/:id", (req, res) => {
    const topic = getTopic.get(req.params.id);
    if (!topic) return res.status(404).json({ message: "Pauta não encontrada." });

    const counts = getVoteCounts.get(topic.id);
    const myVote = getMyVote.get(topic.id, req.user.id);
    const comments = listComments.all(topic.id);
    const events = listEvents.all(topic.id);

    res.json({
      topic: {
        ...topic,
        favorCount: Number(counts.favorCount),
        contraCount: Number(counts.contraCount),
        myVote: myVote?.value ?? null,
      },
      comments,
      events,
    });
  });

  router.patch("/:id", requireStaff, (req, res) => {
    const topic = getTopic.get(req.params.id);
    if (!topic) return res.status(404).json({ message: "Pauta não encontrada." });

    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Informe a data da assembleia (ou null para reabrir)." });
    }

    const { assemblyDate } = parsed.data;
    updateTopicSchedule.run({
      id: topic.id,
      status: assemblyDate ? "scheduled" : "open",
      assembly_date: assemblyDate,
      updated_at: nowIso(),
    });

    const message = assemblyDate
      ? `${req.user.name} marcou a pauta como pautada para ${assemblyDate}`
      : `${req.user.name} reabriu a pauta`;
    recordEvent(topic.id, req.user.id, message);
    notifyTopicWatchers({ topicId: topic.id, actorUserId: req.user.id, message });
    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: assemblyDate ? "topics.schedule" : "topics.reopen",
      entityType: "topic",
      entityId: topic.id,
      details: { assemblyDate },
    });

    res.json({ topic: getTopic.get(topic.id) });
  });

  router.patch("/:id/content", (req, res) => {
    const topic = getTopic.get(req.params.id);
    if (!topic) return res.status(404).json({ message: "Pauta não encontrada." });

    const isOwner = topic.createdById === req.user.id;
    const isStaff = req.user.role === "admin" || req.user.role === "sindico";
    if (!isOwner && !isStaff) {
      return res.status(403).json({ message: "Só quem criou a pauta (ou a administração) pode editá-la." });
    }

    const parsed = editSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Preencha título e descrição da pauta." });
    }

    updateTopicContent.run({ id: topic.id, ...parsed.data, updated_at: nowIso() });
    recordEvent(topic.id, req.user.id, `${req.user.name} editou a pauta`);
    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "topics.edit",
      entityType: "topic",
      entityId: topic.id,
    });
    res.json({ topic: getTopic.get(topic.id) });
  });

  router.patch("/:id/status-note", requireStaff, (req, res) => {
    const topic = getTopic.get(req.params.id);
    if (!topic) return res.status(404).json({ message: "Pauta não encontrada." });

    const parsed = statusNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Escreva uma atualização (ou null para remover)." });
    }

    const { note } = parsed.data;
    updateStatusNote.run({ id: topic.id, status_note: note, updated_at: nowIso() });

    const message = note
      ? `${req.user.name} atualizou a pauta: ${note}`
      : `${req.user.name} removeu a atualização da pauta`;
    recordEvent(topic.id, req.user.id, message);
    notifyTopicWatchers({ topicId: topic.id, actorUserId: req.user.id, message });
    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "topics.status_note",
      entityType: "topic",
      entityId: topic.id,
      details: { note },
    });

    res.json({ topic: getTopic.get(topic.id) });
  });

  router.delete("/:id", (req, res) => {
    const topic = getTopic.get(req.params.id);
    if (!topic) return res.status(404).json({ message: "Pauta não encontrada." });

    const isOwner = topic.createdById === req.user.id;
    let reason = null;

    if (!isOwner) {
      if (req.user.role !== "admin") {
        return res.status(403).json({
          message: "Só quem criou a pauta (ou um administrador, com um motivo) pode excluí-la.",
        });
      }
      const parsed = deleteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Informe um motivo com pelo menos 10 caracteres." });
      }
      reason = parsed.data.reason;
    }

    deleteTopicCascade(topic.id);

    if (!isOwner) {
      notifyUser({
        userId: topic.createdById,
        topicId: null,
        message: `Sua pauta "${topic.title}" foi excluída pela administração. Motivo: ${reason}`,
      });
    }

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "topics.delete",
      entityType: "topic",
      entityId: topic.id,
      details: { title: topic.title, reason, ownTopic: isOwner },
    });

    res.status(204).end();
  });

  router.post("/:id/vote", (req, res) => {
    const topic = getTopic.get(req.params.id);
    if (!topic) return res.status(404).json({ message: "Pauta não encontrada." });

    const parsed = voteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Voto deve ser 'favor' ou 'contra'." });
    }

    upsertVote.run({
      id: randomUUID(),
      topic_id: topic.id,
      user_id: req.user.id,
      value: parsed.data.value,
      updated_at: nowIso(),
    });
    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "topics.vote",
      entityType: "topic",
      entityId: topic.id,
      details: { value: parsed.data.value },
    });

    const counts = getVoteCounts.get(topic.id);
    res.json({
      favorCount: Number(counts.favorCount),
      contraCount: Number(counts.contraCount),
      myVote: parsed.data.value,
    });
  });

  router.post("/:id/comments", (req, res) => {
    const topic = getTopic.get(req.params.id);
    if (!topic) return res.status(404).json({ message: "Pauta não encontrada." });

    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Escreva um comentário." });
    }

    const id = randomUUID();
    insertComment.run({ id, topic_id: topic.id, user_id: req.user.id, body: parsed.data.body });
    notifyTopicWatchers({
      topicId: topic.id,
      actorUserId: req.user.id,
      message: `${req.user.name} comentou em "${topic.title}"`,
    });
    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "comments.create",
      entityType: "comment",
      entityId: id,
      details: { topicId: topic.id },
    });
    res.status(201).json({ comments: listComments.all(topic.id) });
  });

  router.patch("/:id/comments/:commentId", (req, res) => {
    const topic = getTopic.get(req.params.id);
    if (!topic) return res.status(404).json({ message: "Pauta não encontrada." });

    const comment = getCommentById.get(req.params.commentId);
    if (!comment || comment.topic_id !== topic.id) {
      return res.status(404).json({ message: "Comentário não encontrado." });
    }

    const isAuthor = comment.user_id === req.user.id;
    const isStaff = req.user.role === "admin" || req.user.role === "sindico";
    if (!isAuthor && !isStaff) {
      return res.status(403).json({
        message: "Só quem escreveu o comentário (ou a administração) pode editá-lo.",
      });
    }

    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Escreva um comentário." });
    }

    updateComment.run({ id: comment.id, body: parsed.data.body, updated_at: nowIso() });
    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "comments.edit",
      entityType: "comment",
      entityId: comment.id,
      details: { topicId: topic.id },
    });
    res.json({ comments: listComments.all(topic.id) });
  });

  return router;
}
