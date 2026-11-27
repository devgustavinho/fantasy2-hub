import type { Role, User } from "@/lib/types";

export const ALL_ROLES: Role[] = ["admin", "sindico", "conselheiro", "morador"];

export const PRIVILEGED_ROLES: Role[] = ["admin", "sindico", "conselheiro"];

/** Cargos que sempre implicam `morador`. Síndico pode ser profissional (sem morador). */
export const ROLES_REQUIRING_MORADOR: Role[] = ["admin", "conselheiro"];

export function rolesRequireMorador(roles: Role[]) {
  return roles.some((r) => ROLES_REQUIRING_MORADOR.includes(r));
}

/** Admin/conselheiro sem morador → inclui morador. Ordem estável de ALL_ROLES. */
export function normalizeRoleMembership(roles: Role[]): Role[] {
  const unique = [...new Set(roles)].filter((r) => ALL_ROLES.includes(r));
  if (!unique.length) return unique;
  if (rolesRequireMorador(unique) && !unique.includes("morador")) {
    unique.push("morador");
  }
  return ALL_ROLES.filter((r) => unique.includes(r));
}

/** Remover `morador` só é permitido se não restar admin/conselheiro. */
export function canRemoveMorador(roles: Role[]) {
  return !rolesRequireMorador(roles);
}

export function roleLabel(role: Role) {
  if (role === "admin") return "Administrador";
  if (role === "sindico") return "Síndico";
  if (role === "conselheiro") return "Conselheiro";
  return "Morador";
}

export function roleBadgeVariant(role: Role) {
  if (role === "admin") return "default" as const;
  if (role === "sindico") return "success" as const;
  if (role === "conselheiro") return "gold" as const;
  return "secondary" as const;
}

export function userRoles(user: Pick<User, "role" | "roles"> | null | undefined): Role[] {
  if (!user) return [];
  if (Array.isArray(user.roles) && user.roles.length) return user.roles;
  return user.role ? [user.role] : [];
}

export function hasRole(user: Pick<User, "role" | "roles"> | null | undefined, role: Role) {
  return userRoles(user).includes(role);
}

export function hasAnyPrivilegedRole(user: Pick<User, "role" | "roles"> | null | undefined) {
  return userRoles(user).some((r) => PRIVILEGED_ROLES.includes(r));
}

export function roleRequires2fa(role: Role) {
  return PRIVILEGED_ROLES.includes(role);
}

/** Visão ativa é staff (dock / rotas admin) — não membership. */
export function activeIsStaff(role: Role | null | undefined) {
  return role === "admin" || role === "sindico";
}

export function activeIsAdmin(role: Role | null | undefined) {
  return role === "admin";
}

/** Visão ativa de conselheiro (parecer contábil) — não membership. */
export function activeIsConselheiro(role: Role | null | undefined) {
  return role === "conselheiro";
}

/** Destino após trocar o modo de visualização. */
export function homePathForRole(role: Role) {
  return activeIsStaff(role) ? "/admin" : "/";
}

export function needsTotpSetup(user: Pick<User, "role" | "roles" | "totpEnabled"> | null | undefined) {
  if (!user) return false;
  return hasAnyPrivilegedRole(user) && !user.totpEnabled;
}
