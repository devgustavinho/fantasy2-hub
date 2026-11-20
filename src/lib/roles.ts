import type { Role, User } from "@/lib/types";

export const ALL_ROLES: Role[] = ["admin", "sindico", "conselheiro", "morador"];

export const PRIVILEGED_ROLES: Role[] = ["admin", "sindico", "conselheiro"];

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

export function needsTotpSetup(user: Pick<User, "role" | "roles" | "totpEnabled"> | null | undefined) {
  if (!user) return false;
  return hasAnyPrivilegedRole(user) && !user.totpEnabled;
}
