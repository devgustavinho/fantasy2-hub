import { sqlite } from "../db/client.js";
import { verifySession } from "./jwt.js";
import {
  attachRoles,
  roleRequires2fa,
  userHasRole,
  userIsAdmin,
  userIsConselheiro,
  userIsStaff,
} from "./roles.js";

const getUserById = sqlite.prepare(
  `SELECT u.id, u.apartment_id, u.name, u.email, u.role, u.approval_status, u.whatsapp, u.whatsapp_visible,
          u.household_role, u.totp_enabled,
          a.tower AS tower, a.code AS apartment_code
   FROM users u
   LEFT JOIN apartments a ON a.id = u.apartment_id
   WHERE u.id = ?`,
);

// Token via header (não mais cookie) — cookie cross-site (front no Cloudflare Pages, API na
// VPS, domínios diferentes) esbarra no bloqueio de cookie de terceiro do Safari por padrão,
// mesmo com SameSite=None; Secure configurado certo. `Authorization: Bearer` não é cookie,
// então nenhuma dessas regras de first/third-party se aplica — funciona igual em qualquer
// navegador.
export function loadSession(req, _res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token) {
    const payload = verifySession(token);
    if (payload) {
      const user = getUserById.get(payload.sub);
      if (user) req.user = attachRoles(user);
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ message: "Faça login para continuar." });
  next();
}

/** Bloqueia ações privilegiadas até o 2FA estar configurado. */
export function requireTotpForPrivileged(req, res, next) {
  if (!req.user) return res.status(401).json({ message: "Faça login para continuar." });
  if (roleRequires2fa(req.user.role) && !req.user.totp_enabled) {
    return res.status(403).json({
      code: "totp_required",
      message: "Configure a autenticação em duas etapas para usar este cargo.",
    });
  }
  next();
}

// admin + sindico (membership): tarefas operacionais do dia a dia.
export function requireStaff(req, res, next) {
  if (!req.user) return res.status(401).json({ message: "Faça login para continuar." });
  if (!userIsStaff(req.user)) {
    return res.status(403).json({ message: "Apenas a administração pode fazer isso." });
  }
  if (!req.user.totp_enabled) {
    return res.status(403).json({
      code: "totp_required",
      message: "Configure a autenticação em duas etapas para ações de administração.",
    });
  }
  next();
}

// admin (membership): gerenciar contas e cargos.
export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ message: "Faça login para continuar." });
  if (!userIsAdmin(req.user)) {
    return res.status(403).json({ message: "Apenas o administrador pode fazer isso." });
  }
  if (!req.user.totp_enabled) {
    return res.status(403).json({
      code: "totp_required",
      message: "Configure a autenticação em duas etapas para ações de administrador.",
    });
  }
  next();
}

// conselheiro (membership): pareceres de balancete.
export function requireConselheiro(req, res, next) {
  if (!req.user) return res.status(401).json({ message: "Faça login para continuar." });
  if (!userIsConselheiro(req.user)) {
    return res.status(403).json({ message: "Apenas conselheiros podem dar parecer." });
  }
  if (!req.user.totp_enabled) {
    return res.status(403).json({
      code: "totp_required",
      message: "Configure a autenticação em duas etapas para dar parecer.",
    });
  }
  next();
}

// cadastro precisa ter sido aprovado pela administração pra usar o app de verdade
// (pautas, notificações, etc.) — pendente/recusado só enxerga o próprio status via /auth/me.
export function requireApproved(req, res, next) {
  if (!req.user) return res.status(401).json({ message: "Faça login para continuar." });
  if (req.user.approval_status !== "approved") {
    return res.status(403).json({ message: "Seu cadastro ainda não foi aprovado pela administração." });
  }
  next();
}

export { userHasRole, userIsAdmin, userIsStaff, userIsConselheiro };
