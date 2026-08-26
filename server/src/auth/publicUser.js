// Forma pública de um usuário (o que pode ir pro frontend). Fica num arquivo à parte pra
// evitar import circular entre auth/routes.js, webauthn/routes.js e twoFactor.js.
export function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    apartmentId: user.apartment_id,
    approvalStatus: user.approval_status,
    whatsapp: user.whatsapp ?? null,
    whatsappVisible: Boolean(user.whatsapp_visible),
  };
}
