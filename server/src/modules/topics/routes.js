import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { sqlite } from "../../db/client.js";
import { requireAuth, requireStaff } from "../../auth/guards.js";

const nowIso = () => new Date().toISOString();

const createSchema = z.object({
  title: z.string().trim().min(4).max(160),
  description: z.string().trim().min(4).max(4000),
});

const voteSchema = z.object({
  value: z.enum(["favor", "contra"]),
});

const commentSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

const patchSchema = z.object({
  assemblyDate: z.string().trim().min(1).nullable(),
});

const listTopics = sqlite.prepare(`
  SELECT
    t.id, t.title, t.description, t.status, t.assembly_date AS assemblyDate,
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
    t.created_at AS createdAt, t.updated_at AS updatedAt,
    u.name AS createdByName
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
  SELECT c.id, c.body, c.created_at AS createdAt, u.name AS authorName
  FROM comments c
  JOIN users u ON u.id = c.user_id
  WHERE c.topic_id = ?
  ORDER BY c.created_at ASC
`);

const insertTopic = sqlite.prepare(`
  INSERT INTO topics (id, title, description, created_by)
  VALUES (@id, @title, @description, @created_by)
`);

const updateTopicSchedule = sqlite.prepare(`
  UPDATE topics SET status = @status, assembly_date = @assembly_date, updated_at = @updated_at
  WHERE id = @id
`);

const upsertVote = sqlite.prepare(`
  INSERT INTO votes (id, topic_id, user_id, value)
  VALUES (@id, @topic_id, @user_id, @value)
  ON CONFLICT(topic_id, user_id) DO UPDATE SET value = excluded.value, updated_at = @updated_at
`);

const insertComment = sqlite.prepare(`
  INSERT INTO comments (id, topic_id, user_id, body)
  VALUES (@id, @topic_id, @user_id, @body)
`);

export function topicsRoutes() {
  const router = Router();
  router.use(requireAuth);

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
    res.status(201).json({ topic: getTopic.get(id) });
  });

  router.get("/:id", (req, res) => {
    const topic = getTopic.get(req.params.id);
    if (!topic) return res.status(404).json({ message: "Pauta não encontrada." });

    const counts = getVoteCounts.get(topic.id);
    const myVote = getMyVote.get(topic.id, req.user.id);
    const comments = listComments.all(topic.id);

    res.json({
      topic: {
        ...topic,
        favorCount: Number(counts.favorCount),
        contraCount: Number(counts.contraCount),
        myVote: myVote?.value ?? null,
      },
      comments,
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
    res.json({ topic: getTopic.get(topic.id) });
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
    res.status(201).json({ comments: listComments.all(topic.id) });
  });

  return router;
}
