import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { sqlite } from "../../db/client.js";
import { requireAuth, requireApproved } from "../../auth/guards.js";
import { recordAudit } from "../audit/service.js";
import { deleteFromR2 } from "../../lib/r2.js";
import { processAndSaveImage, saveVideo } from "../../lib/media.js";
import { notifyUser } from "../notifications/service.js";

const MAX_MEDIA_PER_COMMENT = 4;
const VIDEO_MIMETYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const IMAGE_MIMETYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

// Vídeo curto de celular passa fácil de alguns MB — bem mais que uma foto — daí o limite bem
// mais alto que o das imagens de serviço (15MB).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024, files: MAX_MEDIA_PER_COMMENT },
});

function handleMediaUpload(req, res, next) {
  upload.array("media", MAX_MEDIA_PER_COMMENT)(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || "Erro no upload dos arquivos." });
    next();
  });
}

const nowIso = () => new Date().toISOString();

// Mesma lógica de `normalizeInstagram` do módulo de serviços — aceita "@handle", link
// completo ou só o handle, sempre guarda só o handle puro.
function normalizeInstagram(value) {
  if (!value) return null;
  const cleaned = value
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/\/+$/, "");
  return cleaned || null;
}

const recommendationSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(1000).optional().nullable(),
    whatsapp: z.string().trim().max(30).optional().nullable(),
    instagram: z.string().trim().max(60).optional().nullable(),
    tagIds: z.array(z.string()).max(20).optional(),
  })
  .refine((data) => Boolean(data.whatsapp) || Boolean(data.instagram), {
    message: "Informe pelo menos um WhatsApp ou uma rede social.",
  });

const ratingSchema = z.object({ stars: z.coerce.number().int().min(1).max(5) });

const commentSchema = z
  .object({ body: z.string().trim().max(2000).optional().nullable() })
  .transform((data) => ({ body: data.body || null }));

const getRecommendationById = sqlite.prepare("SELECT * FROM recommendations WHERE id = ?");

const RECOMMENDATION_SELECT = `
  SELECT r.id, r.name, r.description, r.whatsapp, r.instagram, r.created_at AS createdAt,
         r.created_by AS createdById, u.name AS createdByName,
         (SELECT COUNT(*) FROM recommendation_ratings WHERE recommendation_id = r.id) AS ratingCount,
         (SELECT AVG(stars) FROM recommendation_ratings WHERE recommendation_id = r.id) AS avgRating,
         (SELECT COUNT(*) FROM recommendation_comments WHERE recommendation_id = r.id) AS commentCount
  FROM recommendations r
  JOIN users u ON u.id = r.created_by
`;

const listRecommendationsBase = sqlite.prepare(`${RECOMMENDATION_SELECT} ORDER BY r.created_at DESC`);
const getRecommendationWithStats = sqlite.prepare(`${RECOMMENDATION_SELECT} WHERE r.id = ?`);

const getMyRating = sqlite.prepare(
  "SELECT stars FROM recommendation_ratings WHERE recommendation_id = ? AND user_id = ?",
);

const upsertRating = sqlite.prepare(`
  INSERT INTO recommendation_ratings (id, recommendation_id, user_id, stars)
  VALUES (@id, @recommendation_id, @user_id, @stars)
  ON CONFLICT(recommendation_id, user_id) DO UPDATE SET stars = excluded.stars, updated_at = @updated_at
`);

const listCommentsByRecommendation = sqlite.prepare(`
  SELECT c.id, c.body, c.created_at AS createdAt, c.user_id AS userId, u.name AS userName
  FROM recommendation_comments c
  JOIN users u ON u.id = c.user_id
  WHERE c.recommendation_id = ?
  ORDER BY c.created_at ASC
`);

const listMediaByComment = sqlite.prepare(`
  SELECT id, media_type AS mediaType, path FROM recommendation_comment_media
  WHERE comment_id = ? ORDER BY position ASC, created_at ASC
`);

const insertComment = sqlite.prepare(`
  INSERT INTO recommendation_comments (id, recommendation_id, user_id, body)
  VALUES (@id, @recommendation_id, @user_id, @body)
`);

const insertMedia = sqlite.prepare(`
  INSERT INTO recommendation_comment_media (id, comment_id, media_type, path, position)
  VALUES (@id, @comment_id, @media_type, @path, @position)
`);

const getCommentById = sqlite.prepare("SELECT * FROM recommendation_comments WHERE id = ?");
const deleteCommentById = sqlite.prepare("DELETE FROM recommendation_comments WHERE id = ?");

// Mesmo vocabulário de tags dos serviços (`tags`, curado em `/admin/tags`) — só a associação é
// própria da recomendação. Diferente de serviços (só admin atribui tag), aqui quem cadastrou a
// recomendação escolhe as próprias tags: são muitas recomendações informais, não um único
// anúncio por morador, então centralizar em admin geraria gargalo sem ganho real de consistência.
const listTagsByRecommendation = sqlite.prepare(`
  SELECT t.id, t.name FROM recommendation_tags rt JOIN tags t ON t.id = rt.tag_id
  WHERE rt.recommendation_id = ? ORDER BY t.name ASC
`);
const deleteRecommendationTags = sqlite.prepare("DELETE FROM recommendation_tags WHERE recommendation_id = ?");
const insertRecommendationTag = sqlite.prepare(
  "INSERT OR IGNORE INTO recommendation_tags (recommendation_id, tag_id) VALUES (?, ?)",
);
const getTagById = sqlite.prepare("SELECT id FROM tags WHERE id = ?");

const applyRecommendationTags = sqlite.transaction((recommendationId, tagIds) => {
  deleteRecommendationTags.run(recommendationId);
  for (const tagId of tagIds) insertRecommendationTag.run(recommendationId, tagId);
});

// Valida antes de tocar no banco — sem isso, uma tag inexistente no meio da lista deixaria a
// recomendação já criada/editada mas com tags parcialmente aplicadas.
function allTagsExist(tagIds) {
  return tagIds.every((tagId) => Boolean(getTagById.get(tagId)));
}

const insertRecommendation = sqlite.prepare(`
  INSERT INTO recommendations (id, created_by, name, description, whatsapp, instagram)
  VALUES (@id, @created_by, @name, @description, @whatsapp, @instagram)
`);

const updateRecommendation = sqlite.prepare(`
  UPDATE recommendations
  SET name = @name, description = @description, whatsapp = @whatsapp, instagram = @instagram, updated_at = @updated_at
  WHERE id = @id
`);

const deleteRecommendationById = sqlite.prepare("DELETE FROM recommendations WHERE id = ?");

function serializeRecommendation(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    whatsapp: row.whatsapp,
    instagram: row.instagram,
    createdAt: row.createdAt,
    createdBy: { id: row.createdById, name: row.createdByName },
    ratingCount: row.ratingCount,
    avgRating: row.avgRating,
    commentCount: row.commentCount,
    tags: listTagsByRecommendation.all(row.id),
  };
}

function serializeComment(row) {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.createdAt,
    author: { id: row.userId, name: row.userName },
    media: listMediaByComment.all(row.id),
  };
}

async function saveMediaFiles(commentId, files) {
  let position = 0;
  for (const file of files) {
    if (IMAGE_MIMETYPES.has(file.mimetype)) {
      const path = await processAndSaveImage(file.buffer, "recommendations");
      insertMedia.run({ id: randomUUID(), comment_id: commentId, media_type: "image", path, position });
    } else if (VIDEO_MIMETYPES.has(file.mimetype)) {
      const path = await saveVideo(file.buffer, file.mimetype, "recommendations");
      insertMedia.run({ id: randomUUID(), comment_id: commentId, media_type: "video", path, position });
    } else {
      throw new Error(`Formato não suportado: ${file.mimetype}`);
    }
    position += 1;
  }
}

export function recommendationsRoutes() {
  const router = Router();
  router.use(requireAuth, requireApproved);

  router.get("/", (req, res) => {
    const tagFilter = typeof req.query.tags === "string" ? req.query.tags.split(",").filter(Boolean) : [];

    let recommendations = listRecommendationsBase.all().map(serializeRecommendation);
    if (tagFilter.length > 0) {
      recommendations = recommendations.filter((r) => r.tags.some((t) => tagFilter.includes(t.id)));
    }

    res.json({ recommendations });
  });

  router.get("/:id", (req, res) => {
    const recommendation = getRecommendationWithStats.get(req.params.id);
    if (!recommendation) return res.status(404).json({ message: "Recomendação não encontrada." });

    res.json({
      recommendation: serializeRecommendation(recommendation),
      comments: listCommentsByRecommendation.all(recommendation.id).map(serializeComment),
      myRating: getMyRating.get(recommendation.id, req.user.id)?.stars ?? null,
    });
  });

  router.post("/", (req, res) => {
    const parsed = recommendationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." });
    }

    const tagIds = parsed.data.tagIds ?? [];
    if (!allTagsExist(tagIds)) {
      return res.status(400).json({ message: "Tag inexistente." });
    }

    const id = randomUUID();
    insertRecommendation.run({
      id,
      created_by: req.user.id,
      name: parsed.data.name,
      description: parsed.data.description || null,
      whatsapp: parsed.data.whatsapp || null,
      instagram: normalizeInstagram(parsed.data.instagram),
    });
    if (tagIds.length > 0) applyRecommendationTags(id, tagIds);

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "recommendations.create",
      entityType: "recommendation",
      entityId: id,
      details: { name: parsed.data.name },
    });

    res.status(201).json({ recommendation: serializeRecommendation(getRecommendationWithStats.get(id)) });
  });

  router.patch("/:id", (req, res) => {
    const recommendation = getRecommendationById.get(req.params.id);
    if (!recommendation) return res.status(404).json({ message: "Recomendação não encontrada." });
    if (recommendation.created_by !== req.user.id) {
      return res.status(403).json({ message: "Só quem cadastrou a recomendação pode editá-la." });
    }

    const parsed = recommendationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." });
    }

    if (parsed.data.tagIds && !allTagsExist(parsed.data.tagIds)) {
      return res.status(400).json({ message: "Tag inexistente." });
    }

    updateRecommendation.run({
      id: recommendation.id,
      name: parsed.data.name,
      description: parsed.data.description || null,
      whatsapp: parsed.data.whatsapp || null,
      instagram: normalizeInstagram(parsed.data.instagram),
      updated_at: nowIso(),
    });
    // `tagIds` ausente = não mexe nas tags atuais; presente (mesmo vazio) = substitui tudo.
    if (parsed.data.tagIds) applyRecommendationTags(recommendation.id, parsed.data.tagIds);

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "recommendations.edit",
      entityType: "recommendation",
      entityId: recommendation.id,
    });

    res.json({ recommendation: serializeRecommendation(getRecommendationWithStats.get(recommendation.id)) });
  });

  router.delete("/:id", (req, res) => {
    const recommendation = getRecommendationById.get(req.params.id);
    if (!recommendation) return res.status(404).json({ message: "Recomendação não encontrada." });
    const isOwner = recommendation.created_by === req.user.id;
    const isStaff = req.user.role === "admin" || req.user.role === "sindico";
    if (!isOwner && !isStaff) {
      return res.status(403).json({ message: "Só quem cadastrou a recomendação (ou a administração) pode excluí-la." });
    }

    for (const comment of listCommentsByRecommendation.all(recommendation.id)) {
      for (const media of listMediaByComment.all(comment.id)) {
        deleteFromR2(media.path);
      }
    }
    deleteRecommendationById.run(recommendation.id);

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "recommendations.delete",
      entityType: "recommendation",
      entityId: recommendation.id,
      details: { name: recommendation.name },
    });

    res.status(204).end();
  });

  router.put("/:id/rating", (req, res) => {
    const recommendation = getRecommendationById.get(req.params.id);
    if (!recommendation) return res.status(404).json({ message: "Recomendação não encontrada." });

    const parsed = ratingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Escolha uma nota de 1 a 5 estrelas." });

    upsertRating.run({
      id: randomUUID(),
      recommendation_id: recommendation.id,
      user_id: req.user.id,
      stars: parsed.data.stars,
      updated_at: nowIso(),
    });

    res.json({ recommendation: serializeRecommendation(getRecommendationWithStats.get(recommendation.id)) });
  });

  router.post("/:id/comments", handleMediaUpload, async (req, res) => {
    const recommendation = getRecommendationById.get(req.params.id);
    if (!recommendation) return res.status(404).json({ message: "Recomendação não encontrada." });

    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Comentário inválido." });
    }

    const files = req.files ?? [];
    if (!parsed.data.body && files.length === 0) {
      return res.status(400).json({ message: "Escreva um comentário ou anexe uma foto/vídeo." });
    }

    const id = randomUUID();
    try {
      insertComment.run({ id, recommendation_id: recommendation.id, user_id: req.user.id, body: parsed.data.body });
      await saveMediaFiles(id, files);
    } catch (err) {
      for (const media of listMediaByComment.all(id)) deleteFromR2(media.path);
      deleteCommentById.run(id);
      return res.status(400).json({ message: err.message || "Não foi possível processar os arquivos enviados." });
    }

    if (recommendation.created_by !== req.user.id) {
      notifyUser({
        userId: recommendation.created_by,
        linkUrl: `/recomendacoes/${recommendation.id}`,
        message: `${req.user.name} comentou na recomendação "${recommendation.name}"`,
      });
    }

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "recommendations.comment_create",
      entityType: "recommendation_comment",
      entityId: id,
      details: { recommendationId: recommendation.id },
    });

    res.status(201).json({ comments: listCommentsByRecommendation.all(recommendation.id).map(serializeComment) });
  });

  router.delete("/:id/comments/:commentId", (req, res) => {
    const recommendation = getRecommendationById.get(req.params.id);
    if (!recommendation) return res.status(404).json({ message: "Recomendação não encontrada." });

    const comment = getCommentById.get(req.params.commentId);
    if (!comment || comment.recommendation_id !== recommendation.id) {
      return res.status(404).json({ message: "Comentário não encontrado." });
    }

    const isAuthor = comment.user_id === req.user.id;
    const isStaff = req.user.role === "admin" || req.user.role === "sindico";
    if (!isAuthor && !isStaff) {
      return res.status(403).json({ message: "Só quem escreveu o comentário (ou a administração) pode excluí-lo." });
    }

    for (const media of listMediaByComment.all(comment.id)) {
      deleteFromR2(media.path);
    }
    deleteCommentById.run(comment.id);

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "recommendations.comment_delete",
      entityType: "recommendation_comment",
      entityId: comment.id,
      details: { recommendationId: recommendation.id },
    });

    res.json({ comments: listCommentsByRecommendation.all(recommendation.id).map(serializeComment) });
  });

  return router;
}
