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
import { isApiTokenFormat } from "../modules/apiTokens/crypto.js";
import {
  authenticateApiToken,
  parseTokenScopes,
  touchApiTokenLastUsed,
} from "../modules/apiTokens/service.js";

const getUserById = sqlite.prepare(
  `SELECT u.id, u.apartment_id, u.name, u.email, u.role, u.approval_status, u.whatsapp, u.whatsapp_visible,
          u.household_role, u.totp_enabled,
          a.tower AS tower, a.code AS apartment_code
   FROM users u
   LEFT JOIN apartments a ON a.id = u.apartment_id
   WHERE u.id = ?`,
);

const API_TOKEN_AUTH_ERRORS = {
  expired: { code: "api_token_expired", message: "API token expirado." },
  revoked: { code: "api_token_revoked", message: "API token revogado." },
  invalid: { code: "api_token_invalid", message: "API token inválido." },
};

// Token via header (não mais cookie) — cookie cross-site (front no Cloudflare Pages, API na
// VPS, domínios diferentes) esbarra no bloqueio de cookie de terceiro do Safari por padrão,
// mesmo com SameSite=None; Secure configurado certo. `Authorization: Bearer` não é cookie,
// então nenhuma dessas regras de first/third-party se aplica — funciona igual em qualquer
// navegador.
//
// Aceita JWT de sessão (login) ou API token `f2h_…` (MCP). API tokens só podem chamar `/mcp`
// (ver rejectApiTokenOutsideMcp); o handler do MCP troca f2h_ por JWT interno curto no loopback.
// JWT de sessão no /mcp ainda funciona, com aviso de depreciação.
export function loadSession(req, _res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (token) {
    if (isApiTokenFormat(token)) {
      const auth = authenticateApiToken(token);
      if (auth.ok) {
        const user = getUserById.get(auth.row.user_id);
        if (user) {
          req.user = attachRoles(user);
          req.authKind = "api_token";
          req.apiTokenId = auth.row.id;
          req.apiTokenScopes = parseTokenScopes(auth.row);
          touchApiTokenLastUsed(auth.row);
        } else {
          req.apiTokenAuthError = "invalid";
        }
      } else {
        req.apiTokenAuthError = auth.reason;
      }
    } else {
      const payload = verifySession(token);
      if (payload) {
        const user = getUserById.get(payload.sub);
        if (user) {
          req.user = attachRoles(user);
          req.authKind = payload.kind === "internal" ? "internal" : "session";
        }
      }
    }
  }
  next();
}

/** Bearer f2h_ expirado/revogado/inválido → 401 com mensagem clara (antes do requireAuth genérico). */
export function rejectFailedApiToken(req, res, next) {
  if (!req.apiTokenAuthError) return next();
  const body = API_TOKEN_AUTH_ERRORS[req.apiTokenAuthError] || API_TOKEN_AUTH_ERRORS.invalid;
  return res.status(401).json(body);
}

/** Bloqueia API token fora de `/mcp` — REST e gestão de tokens usam só JWT. */
export function rejectApiTokenOutsideMcp(req, res, next) {
  if (req.authKind === "api_token") {
    const path = req.path || "";
    if (!path.startsWith("/mcp")) {
      return res.status(403).json({
        message: "API token só é aceito no endpoint MCP. Use a sessão do Hub para o restante.",
      });
    }
  }
  next();
}

/** Rotas de gestão de API tokens: somente sessão JWT (nunca f2h_ / internal). */
export function requireJwtSession(req, res, next) {
  if (!req.user) return res.status(401).json({ message: "Faça login para continuar." });
  if (req.authKind !== "session") {
    return res.status(403).json({
      message: "Gerencie tokens de API apenas com a sessão do Hub (login no navegador).",
    });
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
