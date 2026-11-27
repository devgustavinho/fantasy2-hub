import { sqlite } from "../db/client.js";
import {
  ALL_ROLES,
  canRemoveMorador,
  normalizeRoleMembership,
  rolesRequireMorador,
  ROLES_REQUIRING_MORADOR,
} from "./roleMembership.js";

export {
  ALL_ROLES,
  canRemoveMorador,
  normalizeRoleMembership,
  rolesRequireMorador,
  ROLES_REQUIRING_MORADOR,
};

export const PRIVILEGED_ROLES = ["admin", "sindico", "conselheiro"];

const ROLE_RANK = { admin: 4, sindico: 3, conselheiro: 2, morador: 1 };

const listRolesStmt = sqlite.prepare(
  "SELECT role FROM user_roles WHERE user_id = ? ORDER BY role",
);
const insertRoleStmt = sqlite.prepare(
  "INSERT OR IGNORE INTO user_roles (user_id, role) VALUES (?, ?)",
);
const deleteRolesStmt = sqlite.prepare("DELETE FROM user_roles WHERE user_id = ?");
const deleteRoleStmt = sqlite.prepare(
  "DELETE FROM user_roles WHERE user_id = ? AND role = ?",
);
const setActiveRoleStmt = sqlite.prepare("UPDATE users SET role = ? WHERE id = ?");
const countAdminsStmt = sqlite.prepare(`
  SELECT COUNT(DISTINCT user_id) AS c
  FROM user_roles
  WHERE role = 'admin'
`);
const countAdminsExcludingStmt = sqlite.prepare(`
  SELECT COUNT(DISTINCT user_id) AS c
  FROM user_roles
  WHERE role = 'admin' AND user_id != ?
`);

export function listUserRoles(userId) {
  return listRolesStmt.all(userId).map((row) => row.role);
}

export function pickDefaultActiveRole(roles) {
  if (!roles.length) return "morador";
  return [...roles].sort((a, b) => (ROLE_RANK[b] ?? 0) - (ROLE_RANK[a] ?? 0))[0];
}

export function roleRequires2fa(role) {
  return PRIVILEGED_ROLES.includes(role);
}

export function rolesRequire2fa(roles) {
  return roles.some(roleRequires2fa);
}

export function userHasRole(user, role) {
  const roles = user.roles ?? (user.role ? [user.role] : []);
  return roles.includes(role);
}

export function userIsStaff(user) {
  return userHasRole(user, "admin") || userHasRole(user, "sindico");
}

export function userIsAdmin(user) {
  return userHasRole(user, "admin");
}

export function userIsConselheiro(user) {
  return userHasRole(user, "conselheiro");
}

/** Active-view staff (dock / route mode), not membership. */
export function activeIsStaff(role) {
  return role === "admin" || role === "sindico";
}

export function activeIsAdmin(role) {
  return role === "admin";
}

/** Active-view conselheiro (parecer contábil UI), not membership. */
export function activeIsConselheiro(role) {
  return role === "conselheiro";
}

export function ensureUserRole(userId, role) {
  insertRoleStmt.run(userId, role);
}

export function setUserRoles(userId, roles, { activeRole } = {}) {
  const unique = normalizeRoleMembership(roles);
  if (!unique.length) {
    throw new Error("É necessário pelo menos um cargo.");
  }

  const tx = sqlite.transaction(() => {
    deleteRolesStmt.run(userId);
    for (const role of unique) {
      insertRoleStmt.run(userId, role);
    }
    const nextActive =
      activeRole && unique.includes(activeRole)
        ? activeRole
        : pickDefaultActiveRole(unique);
    setActiveRoleStmt.run(nextActive, userId);
    return { roles: unique, activeRole: nextActive };
  });

  return tx();
}

export function setActiveRole(userId, role) {
  const roles = listUserRoles(userId);
  if (!roles.includes(role)) {
    return { error: "Você não possui este cargo." };
  }
  setActiveRoleStmt.run(role, userId);
  return { roles, activeRole: role };
}

export function countAdmins() {
  return countAdminsStmt.get().c;
}

export function countAdminsExcluding(userId) {
  return countAdminsExcludingStmt.get(userId).c;
}

export function removeRole(userId, role) {
  deleteRoleStmt.run(userId, role);
}

export function attachRoles(user) {
  if (!user) return user;
  const roles = listUserRoles(user.id);
  // Fallback se migration ainda não rodou em algum ambiente legado.
  const resolved = roles.length ? roles : user.role ? [user.role] : ["morador"];
  return { ...user, roles: resolved };
}
