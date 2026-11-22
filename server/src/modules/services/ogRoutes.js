import { Router } from "express";
import { sqlite } from "../../db/client.js";
import { isValidSlug, normalizeSlugInput } from "./slug.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DESC_MAX = 180;

const getBySlug = sqlite.prepare(`
  SELECT s.id, s.name, s.description, s.image_path AS imagePath, s.slug,
         a.tower, a.code AS apartmentCode
  FROM condo_services s
  JOIN users u ON u.id = s.user_id
  LEFT JOIN apartments a ON a.id = u.apartment_id
  WHERE s.slug = ? COLLATE NOCASE
`);

const getById = sqlite.prepare(`
  SELECT s.id, s.name, s.description, s.image_path AS imagePath, s.slug,
         a.tower, a.code AS apartmentCode
  FROM condo_services s
  JOIN users u ON u.id = s.user_id
  LEFT JOIN apartments a ON a.id = u.apartment_id
  WHERE s.id = ?
`);

const firstItemImage = sqlite.prepare(`
  SELECT i.path
  FROM condo_service_item_images i
  JOIN condo_service_items it ON it.id = i.item_id
  WHERE it.service_id = ?
  ORDER BY i.position ASC, i.created_at ASC
  LIMIT 1
`);

function snippet(text, max = DESC_MAX) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  const cut = cleaned.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > 40 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[.,;:\s]+$/, "")}…`;
}

function ownerLabel(row) {
  if (row.tower != null && row.apartmentCode) {
    return `Torre ${row.tower} · ${row.apartmentCode}`;
  }
  return null;
}

function resolveImagePath(row) {
  if (row.imagePath) return row.imagePath;
  const itemImg = firstItemImage.get(row.id);
  return itemImg?.path ?? null;
}

function toOgPayload(row) {
  const label = ownerLabel(row);
  const descParts = [];
  const descSnippet = snippet(row.description);
  if (descSnippet) descParts.push(descSnippet);
  if (label) descParts.push(label);
  descParts.push("Peça pelo hub");

  return {
    id: row.id,
    name: row.name,
    title: row.name,
    description: descParts.join(" · "),
    imagePath: resolveImagePath(row),
    slug: row.slug,
    ownerLabel: label,
  };
}

/** Rotas públicas (sem auth) — nome + descrição + capa, para OG/WhatsApp. */
export function servicesOgRoutes() {
  const router = Router();

  router.get("/by-slug/:slug", (req, res) => {
    const slug = normalizeSlugInput(req.params.slug);
    if (!isValidSlug(slug)) {
      return res.status(400).json({ message: "Link curto inválido." });
    }
    const row = getBySlug.get(slug);
    if (!row) return res.status(404).json({ message: "Negócio não encontrado." });
    res.set("Cache-Control", "public, max-age=120");
    res.json(toOgPayload(row));
  });

  router.get("/:id", (req, res) => {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ message: "ID inválido." });
    }
    const row = getById.get(req.params.id);
    if (!row) return res.status(404).json({ message: "Negócio não encontrado." });
    res.set("Cache-Control", "public, max-age=120");
    res.json(toOgPayload(row));
  });

  return router;
}
