import { sqlite } from "../../db/client.js";

/** Slug URL-safe escolhido pelo vendedor: 3–48 chars, letras/números/_/-. */
export const SLUG_MIN = 3;
export const SLUG_MAX = 48;
export const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{2,47}$/;

const RESERVED = new Set([
  "meu",
  "og",
  "new",
  "admin",
  "api",
  "login",
  "n",
  "t",
  "servicos",
  "negocios",
]);

const slugExists = sqlite.prepare(
  "SELECT id FROM condo_services WHERE slug = ? COLLATE NOCASE LIMIT 1",
);

export function isValidSlug(slug) {
  return typeof slug === "string" && SLUG_RE.test(slug) && !RESERVED.has(slug.toLowerCase());
}

export function normalizeSlugInput(raw) {
  if (typeof raw !== "string") return "";
  return raw.trim();
}

/** Sugere slug a partir do nome do negócio (PascalCase sem acentos). */
export function suggestSlugFromName(name) {
  const cleaned = String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim();
  if (!cleaned) return "";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const pascal = parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("")
    .slice(0, SLUG_MAX);
  if (pascal.length >= SLUG_MIN && isValidSlug(pascal)) return pascal;
  // Fallback: só alfanumérico
  const compact = cleaned.replace(/\s+/g, "").slice(0, SLUG_MAX);
  return compact.length >= SLUG_MIN ? compact : "";
}

/**
 * Garante slug único: se `base` já existe (outro id), acrescenta sufixo numérico.
 * Retorna null se base inválida.
 */
export function allocateUniqueSlug(base, excludeServiceId = null) {
  const seed = normalizeSlugInput(base);
  if (!isValidSlug(seed)) return null;

  let candidate = seed;
  for (let i = 0; i < 50; i += 1) {
    const row = slugExists.get(candidate);
    if (!row || (excludeServiceId && row.id === excludeServiceId)) return candidate;
    const suffix = String(i + 2);
    const truncated = seed.slice(0, Math.max(SLUG_MIN, SLUG_MAX - suffix.length));
    candidate = `${truncated}${suffix}`;
    if (!isValidSlug(candidate)) return null;
  }
  return null;
}

export function slugValidationMessage(slug) {
  const value = normalizeSlugInput(slug);
  if (!value) return "Informe um link curto pro negócio.";
  if (value.length < SLUG_MIN || value.length > SLUG_MAX) {
    return `O link curto deve ter entre ${SLUG_MIN} e ${SLUG_MAX} caracteres.`;
  }
  if (!SLUG_RE.test(value)) {
    return "Use só letras, números, _ ou - (começa com letra ou número).";
  }
  if (RESERVED.has(value.toLowerCase())) {
    return "Esse link curto está reservado. Escolha outro.";
  }
  return null;
}

const listMissingSlug = sqlite.prepare("SELECT id, name FROM condo_services WHERE slug IS NULL OR slug = ''");
const setSlug = sqlite.prepare("UPDATE condo_services SET slug = ? WHERE id = ? AND (slug IS NULL OR slug = '')");

/** Preenche slug em negócios antigos a partir do nome. Idempotente. */
export function ensureServiceSlugs() {
  const missing = listMissingSlug.all();
  if (missing.length === 0) return 0;
  const fill = sqlite.transaction((rows) => {
    for (const row of rows) {
      const base = suggestSlugFromName(row.name) || `negocio${row.id.replace(/-/g, "").slice(0, 8)}`;
      const slug = allocateUniqueSlug(base, row.id);
      if (slug) setSlug.run(slug, row.id);
    }
  });
  fill(missing);
  return missing.length;
}
