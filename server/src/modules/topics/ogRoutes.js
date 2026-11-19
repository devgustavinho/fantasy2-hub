import { Router } from "express";
import { sqlite } from "../../db/client.js";
import { isValidShareCode } from "./shareCode.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DESC_MAX = 180;

const getByCode = sqlite.prepare(`
  SELECT id, title, description, share_code AS shareCode
  FROM topics WHERE share_code = ?
`);

const getById = sqlite.prepare(`
  SELECT id, title, description, share_code AS shareCode
  FROM topics WHERE id = ?
`);

function snippet(text, max = DESC_MAX) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  const cut = cleaned.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > 40 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[.,;:\s]+$/, "")}…`;
}

function toOgPayload(row) {
  return {
    id: row.id,
    title: row.title,
    description: snippet(row.description),
    shareCode: row.shareCode,
  };
}

/** Rotas públicas (sem auth) — só título + início da descrição, para OG/WhatsApp. */
export function topicsOgRoutes() {
  const router = Router();

  router.get("/by-code/:code", (req, res) => {
    if (!isValidShareCode(req.params.code)) {
      return res.status(400).json({ message: "Código inválido." });
    }
    const row = getByCode.get(req.params.code);
    if (!row) return res.status(404).json({ message: "Pauta não encontrada." });
    res.set("Cache-Control", "public, max-age=120");
    res.json(toOgPayload(row));
  });

  router.get("/:id", (req, res) => {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ message: "ID inválido." });
    }
    const row = getById.get(req.params.id);
    if (!row) return res.status(404).json({ message: "Pauta não encontrada." });
    res.set("Cache-Control", "public, max-age=120");
    res.json(toOgPayload(row));
  });

  return router;
}
