import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { sqlite } from "../../db/client.js";
import { env } from "../../env.js";
import { hashPassword } from "../../auth/password.js";
import { requireAdmin, requireStaff } from "../../auth/guards.js";
import { createPasswordResetToken } from "../auth/passwordReset.js";
import { recordAudit } from "../audit/service.js";
import { notifyUser } from "../notifications/service.js";
import { sendEmail } from "../../lib/email.js";
import { passwordResetEmail } from "../../lib/emailTemplates.js";

const createSindicoSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
  apartmentId: z.string().min(1).nullable().optional(),
});

const changeRoleSchema = z.object({
  role: z.enum(["admin", "sindico", "morador"]),
});

const listUsers = sqlite.prepare(`
  SELECT
    u.id, u.name, u.email, u.role, u.created_at AS createdAt,
    u.approval_status AS approvalStatus, u.whatsapp, u.whatsapp_visible AS whatsappVisible,
    u.household_role AS householdRole,
    a.tower, a.code AS apartmentCode
  FROM users u
  LEFT JOIN apartments a ON a.id = u.apartment_id
  ORDER BY u.created_at ASC
`);

const getUserById = sqlite.prepare("SELECT id, name, email, role, apartment_id FROM users WHERE id = ?");
const countAdmins = sqlite.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'");
const getApartment = sqlite.prepare("SELECT id FROM apartments WHERE id = ?");
const getApartmentOwner = sqlite.prepare("SELECT id FROM users WHERE apartment_id = ?");
const getUserByEmail = sqlite.prepare("SELECT id FROM users WHERE email = ?");

const insertUser = sqlite.prepare(`
  INSERT INTO users (id, apartment_id, name, email, password_hash, role, approval_status)
  VALUES (@id, @apartment_id, @name, @email, @password_hash, 'sindico', 'approved')
`);

const updateRole = sqlite.prepare("UPDATE users SET role = ? WHERE id = ?");
const approveUser = sqlite.prepare("UPDATE users SET approval_status = 'approved' WHERE id = ?");
const rejectUser = sqlite.prepare(
  "UPDATE users SET approval_status = 'rejected', apartment_id = NULL WHERE id = ?",
);

export function usersRoutes() {
  const router = Router();

  router.get("/", requireStaff, (_req, res) => {
    const users = listUsers.all().map((u) => ({ ...u, whatsappVisible: Boolean(u.whatsappVisible) }));
    res.json({ users });
  });

  router.post("/", requireAdmin, async (req, res) => {
    const parsed = createSindicoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Dados inválidos.", issues: parsed.error.issues });
    }
    const { name, email, password, apartmentId } = parsed.data;

    if (apartmentId) {
      if (!getApartment.get(apartmentId)) {
        return res.status(404).json({ message: "Apartamento não encontrado." });
      }
      if (getApartmentOwner.get(apartmentId)) {
        return res.status(409).json({ message: "Este apartamento já está cadastrado." });
      }
    }
    if (getUserByEmail.get(email)) {
      return res.status(409).json({ message: "Já existe uma conta com este e-mail." });
    }

    const passwordHash = await hashPassword(password);
    const id = randomUUID();

    try {
      insertUser.run({
        id,
        apartment_id: apartmentId ?? null,
        name,
        email,
        password_hash: passwordHash,
      });
    } catch (err) {
      if (String(err.message).includes("UNIQUE")) {
        return res.status(409).json({ message: "Apartamento ou e-mail já cadastrado." });
      }
      throw err;
    }

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "users.create_sindico",
      entityType: "user",
      entityId: id,
      details: { email },
    });

    res.status(201).json({ user: { id, name, email, role: "sindico", apartmentId: apartmentId ?? null } });
  });

  router.patch("/:id/role", requireAdmin, (req, res) => {
    const target = getUserById.get(req.params.id);
    if (!target) return res.status(404).json({ message: "Usuário não encontrado." });
    if (target.id === req.user.id) {
      return res.status(400).json({ message: "Você não pode alterar seu próprio cargo." });
    }

    const parsed = changeRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Cargo inválido." });
    }

    if (target.role === "admin" && parsed.data.role !== "admin" && countAdmins.get().c <= 1) {
      return res.status(400).json({ message: "Não é possível remover o último administrador." });
    }

    updateRole.run(parsed.data.role, target.id);
    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "users.role_change",
      entityType: "user",
      entityId: target.id,
      details: { from: target.role, to: parsed.data.role },
    });
    res.json({ user: { id: target.id, role: parsed.data.role } });
  });

  router.patch("/:id/approve", requireAdmin, (req, res) => {
    const target = getUserById.get(req.params.id);
    if (!target) return res.status(404).json({ message: "Usuário não encontrado." });

    approveUser.run(target.id);
    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "users.approve",
      entityType: "user",
      entityId: target.id,
    });
    notifyUser({
      userId: target.id,
      topicId: null,
      message: "Seu cadastro foi aprovado! Você já pode acessar o Fantasy 2 Hub.",
    });
    res.status(204).end();
  });

  router.patch("/:id/reject", requireAdmin, (req, res) => {
    const target = getUserById.get(req.params.id);
    if (!target) return res.status(404).json({ message: "Usuário não encontrado." });

    rejectUser.run(target.id);
    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "users.reject",
      entityType: "user",
      entityId: target.id,
      details: { freedApartmentId: target.apartment_id },
    });
    res.status(204).end();
  });

  // Reset assistido: sindico só reseta senha de morador; admin reseta sindico ou morador;
  // ninguém reseta o admin. Não gera mais senha nenhuma aqui — só um token de uso único (1h),
  // mandado por e-mail num link pra pessoa escolher a própria senha nova
  // (POST /auth/reset-password, ver server/src/modules/auth/passwordReset.js).
  router.patch("/:id/reset-password", requireStaff, (req, res) => {
    const target = getUserById.get(req.params.id);
    if (!target) return res.status(404).json({ message: "Usuário não encontrado." });
    if (target.role === "admin") {
      return res.status(400).json({ message: "Não é possível resetar a senha do administrador." });
    }
    if (req.user.role === "sindico" && target.role !== "morador") {
      return res.status(403).json({ message: "Síndico só pode resetar a senha de moradores." });
    }

    const token = createPasswordResetToken(target.id);
    const resetUrl = `${env.CORS_ORIGIN}/redefinir-senha?token=${token}`;

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "users.reset_password",
      entityType: "user",
      entityId: target.id,
    });
    sendEmail({ to: target.email, ...passwordResetEmail({ name: target.name, resetUrl }) });
    res.status(204).end();
  });

  return router;
}
