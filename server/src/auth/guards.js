import { sqlite } from "../db/client.js";
import { SESSION_COOKIE, verifySession } from "./jwt.js";

const getUserById = sqlite.prepare(
  "SELECT id, apartment_id, name, email, role FROM users WHERE id = ?",
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

// só admin (conta única do dono do sistema): gerenciar contas e cargos de outros usuários.
export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ message: "Faça login para continuar." });
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Apenas o administrador pode fazer isso." });
  }
  next();
}
