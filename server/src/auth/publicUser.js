import { sqlite } from "../db/client.js";
import { attachRoles } from "./roles.js";

const getApartmentLabel = sqlite.prepare(
  "SELECT tower, code AS apartment_code FROM apartments WHERE id = ?",
);

// Forma pública de um usuário (o que pode ir pro frontend). Fica num arquivo à parte pra
// evitar import circular entre auth/routes.js, webauthn/routes.js e twoFactor.js.
export function toPublicUser(user) {
  const withRoles = attachRoles(user);
  let tower = withRoles.tower ?? null;
  let apartmentCode = withRoles.apartment_code ?? null;
  // Login/`SELECT * FROM users` não traz JOIN — completa torre/apto quando faltar.
  if (withRoles.apartment_id && (tower == null || apartmentCode == null)) {
    const apt = getApartmentLabel.get(withRoles.apartment_id);
    if (apt) {
      tower = apt.tower;
      apartmentCode = apt.apartment_code;
    }
  }
  return {
    id: withRoles.id,
    name: withRoles.name,
    email: withRoles.email,
    role: withRoles.role,
    roles: withRoles.roles,
    apartmentId: withRoles.apartment_id,
    tower,
    apartmentCode,
    approvalStatus: withRoles.approval_status,
    whatsapp: withRoles.whatsapp ?? null,
    whatsappVisible: Boolean(withRoles.whatsapp_visible),
    householdRole: withRoles.household_role,
    totpEnabled: Boolean(withRoles.totp_enabled),
  };
}
