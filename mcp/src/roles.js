/** Role helpers — mirror server/src/auth/guards.js */

export function isStaff(role) {
  return role === "admin" || role === "sindico";
}

export function isAdmin(role) {
  return role === "admin";
}

/** Conselheiro is a tag only — same tools as morador. */
export function permissionTier(role) {
  if (role === "admin") return "admin";
  if (role === "sindico") return "staff";
  return "resident";
}
