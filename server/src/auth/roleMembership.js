/** Cargos válidos do Hub. */
export const ALL_ROLES = ["admin", "sindico", "conselheiro", "morador"];

/** Cargos que sempre implicam o cargo `morador`. Síndico não entra: pode ser profissional. */
export const ROLES_REQUIRING_MORADOR = ["admin", "conselheiro"];

/**
 * Admin e conselheiro são sempre também morador.
 * Síndico pode ser profissional (sem morador) ou síndico-morador.
 * Retorna cargos únicos, válidos e em ordem estável de ALL_ROLES.
 */
export function normalizeRoleMembership(roles) {
  const unique = [...new Set(roles)].filter((r) => ALL_ROLES.includes(r));
  if (!unique.length) return unique;
  const needsMorador = unique.some((r) => ROLES_REQUIRING_MORADOR.includes(r));
  if (needsMorador && !unique.includes("morador")) {
    unique.push("morador");
  }
  return ALL_ROLES.filter((r) => unique.includes(r));
}

export function rolesRequireMorador(roles) {
  return roles.some((r) => ROLES_REQUIRING_MORADOR.includes(r));
}

/** Remover `morador` só é permitido se não restar admin/conselheiro. */
export function canRemoveMorador(roles) {
  return !rolesRequireMorador(roles);
}
