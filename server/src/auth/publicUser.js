import { attachRoles } from "./roles.js";

// Forma pública de um usuário (o que pode ir pro frontend). Fica num arquivo à parte pra
// evitar import circular entre auth/routes.js, webauthn/routes.js e twoFactor.js.
export function toPublicUser(user) {
  const withRoles = attachRoles(user);
  return {
    id: withRoles.id,
    name: withRoles.name,
    email: withRoles.email,
    role: withRoles.role,
    roles: withRoles.roles,
    apartmentId: withRoles.apartment_id,
    approvalStatus: withRoles.approval_status,
    whatsapp: withRoles.whatsapp ?? null,
    whatsappVisible: Boolean(withRoles.whatsapp_visible),
    householdRole: withRoles.household_role,
    totpEnabled: Boolean(withRoles.totp_enabled),
  };
}
