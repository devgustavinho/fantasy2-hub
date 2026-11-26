import { Router } from "express";
import { z } from "zod";
import { sqlite } from "../../db/client.js";
import { requireAuth, requireApproved, requireAdmin } from "../../auth/guards.js";
import { recordAudit } from "../audit/service.js";

const nowIso = () => new Date().toISOString();

const optionalHttpsUrl = z
  .union([z.string().trim().url().startsWith("https://"), z.literal(""), z.null()])
  .optional()
  .transform((v) => {
    if (v == null || v === "") return null;
    return v;
  });

const putSchema = z.object({
  generalUrl: optionalHttpsUrl,
  tower1Url: optionalHttpsUrl,
  tower2Url: optionalHttpsUrl,
  tower3Url: optionalHttpsUrl,
  tower4Url: optionalHttpsUrl,
  tower5Url: optionalHttpsUrl,
});

const getRow = sqlite.prepare(`
  SELECT
    general_url AS generalUrl,
    tower_1_url AS tower1Url,
    tower_2_url AS tower2Url,
    tower_3_url AS tower3Url,
    tower_4_url AS tower4Url,
    tower_5_url AS tower5Url,
    updated_at AS updatedAt
  FROM group_invite_links
  WHERE id = 1
`);

const updateRow = sqlite.prepare(`
  UPDATE group_invite_links
  SET general_url = @general_url,
      tower_1_url = @tower_1_url,
      tower_2_url = @tower_2_url,
      tower_3_url = @tower_3_url,
      tower_4_url = @tower_4_url,
      tower_5_url = @tower_5_url,
      updated_at = @updated_at,
      updated_by = @updated_by
  WHERE id = 1
`);

function towerUrlFor(row, tower) {
  if (!row || tower == null || tower < 1 || tower > 5) return null;
  return row[`tower${tower}Url`] ?? null;
}

function serializeAll(row) {
  return {
    generalUrl: row?.generalUrl ?? null,
    towers: {
      1: row?.tower1Url ?? null,
      2: row?.tower2Url ?? null,
      3: row?.tower3Url ?? null,
      4: row?.tower4Url ?? null,
      5: row?.tower5Url ?? null,
    },
    updatedAt: row?.updatedAt ?? null,
  };
}

export function groupLinksRoutes() {
  const router = Router();
  router.use(requireAuth, requireApproved);

  // Morador: grupo geral + link da própria torre (se tiver apto).
  router.get("/", (req, res) => {
    const row = getRow.get();
    const tower = req.user.tower ?? null;
    res.json({
      generalUrl: row?.generalUrl ?? null,
      tower,
      towerUrl: towerUrlFor(row, tower),
    });
  });

  router.get("/all", requireAdmin, (_req, res) => {
    res.json(serializeAll(getRow.get()));
  });

  router.put("/", requireAdmin, (req, res) => {
    const parsed = putSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Informe URLs https válidas (ou deixe em branco para limpar).",
      });
    }

    const current = getRow.get() || {};
    const next = {
      general_url: parsed.data.generalUrl !== undefined ? parsed.data.generalUrl : current.generalUrl,
      tower_1_url: parsed.data.tower1Url !== undefined ? parsed.data.tower1Url : current.tower1Url,
      tower_2_url: parsed.data.tower2Url !== undefined ? parsed.data.tower2Url : current.tower2Url,
      tower_3_url: parsed.data.tower3Url !== undefined ? parsed.data.tower3Url : current.tower3Url,
      tower_4_url: parsed.data.tower4Url !== undefined ? parsed.data.tower4Url : current.tower4Url,
      tower_5_url: parsed.data.tower5Url !== undefined ? parsed.data.tower5Url : current.tower5Url,
      updated_at: nowIso(),
      updated_by: req.user.id,
    };

    updateRow.run(next);

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "group_links.edit",
      entityType: "group_invite_links",
      entityId: "1",
      details: {
        general: Boolean(next.general_url),
        towers: [1, 2, 3, 4, 5].filter((t) => Boolean(next[`tower_${t}_url`])),
      },
    });

    res.json(serializeAll(getRow.get()));
  });

  return router;
}
