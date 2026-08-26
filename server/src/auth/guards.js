import { sqlite } from "../db/client.js";
import { SESSION_COOKIE, verifySession } from "./jwt.js";

const getUserById = sqlite.prepare(
  "SELECT id, apartment_id, name, email, role, approval_status, whatsapp, whatsapp_visible FROM users WHERE id = ?",
);

export function loadSession(req, _res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    const payload = verifySession(token);
    if (payload) {
      const user = getUserById.get(payload.sub);
      if (user) req.user = user;
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ message: "Faça login para continuar." });
  next();
}

// admin + sindico: tarefas operacionais do dia a dia (marcar pauta como agendada, etc.)
export function requireStaff(req, res, next) {
  if (!req.user) return res.status(401).json({ message: "Faça login para continuar." });
  if (req.user.role !== "admin" && req.user.role !== "sindico") {
    return res.status(403).json({ message: "Apenas a administração pode fazer isso." });
  }
  next();
}

// admin (pode ser mais de um — promovido por outro admin): gerenciar contas e cargos.
export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ message: "Faça login para continuar." });
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Apenas o administrador pode fazer isso." });
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
