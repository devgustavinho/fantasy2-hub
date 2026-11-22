/** Role helpers — mirror server/src/auth/guards.js */

function rolesOf(userOrRole) {
  if (userOrRole && typeof userOrRole === "object") {
    if (Array.isArray(userOrRole.roles) && userOrRole.roles.length) return userOrRole.roles;
    return userOrRole.role ? [userOrRole.role] : [];
  }
  return userOrRole ? [userOrRole] : [];
}

export function isStaff(userOrRole) {
  const roles = rolesOf(userOrRole);
  return roles.includes("admin") || roles.includes("sindico");
}

export function isAdmin(userOrRole) {
  return rolesOf(userOrRole).includes("admin");
}

/** Highest permission tier across all assigned roles. */
export function permissionTier(userOrRole) {
  const roles = rolesOf(userOrRole);
  if (roles.includes("admin")) return "admin";
  if (roles.includes("sindico")) return "staff";
  return "resident";
}
