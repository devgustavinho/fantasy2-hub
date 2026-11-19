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
import {
  emailChangedEmail,
  passwordResetEmail,
  registrationApprovedEmail,
  registrationRejectedEmail,
} from "../../lib/emailTemplates.js";

const createSindicoSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
  apartmentId: z.string().min(1).nullable().optional(),
});

const changeRoleSchema = z.object({
  role: z.enum(["admin", "sindico", "conselheiro", "morador"]),
});

const changeEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

const rejectSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

const listUsersPage = sqlite.prepare(`
  SELECT
    u.id, u.name, u.email, u.role, u.created_at AS createdAt,
    u.approval_status AS approvalStatus, u.whatsapp, u.whatsapp_visible AS whatsappVisible,
    u.household_role AS householdRole,
    a.tower, a.code AS apartmentCode
  FROM users u
  LEFT JOIN apartments a ON a.id = u.apartment_id
  WHERE (@tower IS NULL OR a.tower = @tower)
    AND (@apartment IS NULL OR a.code LIKE @apartment)
    AND (@approvalStatus IS NULL OR u.approval_status = @approvalStatus)
  ORDER BY
    CASE u.approval_status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
    CASE WHEN a.tower IS NULL THEN 1 ELSE 0 END,
    a.tower ASC,
    CASE WHEN a.code IS NULL THEN 1 ELSE 0 END,
    a.code ASC,
    u.created_at ASC
  LIMIT @limit OFFSET @offset
`);

const countUsers = sqlite.prepare(`
  SELECT COUNT(*) AS c
  FROM users u
  LEFT JOIN apartments a ON a.id = u.apartment_id
  WHERE (@tower IS NULL OR a.tower = @tower)
    AND (@apartment IS NULL OR a.code LIKE @apartment)
    AND (@approvalStatus IS NULL OR u.approval_status = @approvalStatus)
`);

const getUserById = sqlite.prepare(
  "SELECT id, name, email, role, apartment_id, approval_status FROM users WHERE id = ?",
);

const getManagedUserById = sqlite.prepare(`
  SELECT
    u.id, u.name, u.email, u.role, u.created_at AS createdAt,
    u.approval_status AS approvalStatus, u.whatsapp, u.whatsapp_visible AS whatsappVisible,
    u.household_role AS householdRole,
    a.tower, a.code AS apartmentCode
  FROM users u
  LEFT JOIN apartments a ON a.id = u.apartment_id
  WHERE u.id = ?
`);
const countAdmins = sqlite.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'");
const getApartment = sqlite.prepare("SELECT id FROM apartments WHERE id = ?");
const getApartmentOwner = sqlite.prepare("SELECT id FROM users WHERE apartment_id = ?");
const getUserByEmail = sqlite.prepare("SELECT id FROM users WHERE email = ?");
const updateEmail = sqlite.prepare("UPDATE users SET email = ? WHERE id = ?");
const getAdminNameById = sqlite.prepare("SELECT name FROM users WHERE id = ?");

// Quem tomou a última decisão de aprovação/recusa (nome gravado no audit no momento da ação;
// se o admin ainda existir, preferimos o nome atual da conta).
const getLastApprovalDecision = sqlite.prepare(`
  SELECT actor_user_id AS actorUserId, actor_name AS actorName, action, created_at AS createdAt
  FROM audit_log
  WHERE entity_type = 'user'
    AND entity_id = @entityId
    AND action = @action
  ORDER BY created_at DESC
  LIMIT 1
`);

const insertUser = sqlite.prepare(`
  INSERT INTO users (id, apartment_id, name, email, password_hash, role, approval_status)
  VALUES (@id, @apartment_id, @name, @email, @password_hash, 'sindico', 'approved')
`);

const updateRole = sqlite.prepare("UPDATE users SET role = ? WHERE id = ?");
// Só aplica se ainda estiver pendente — evita corrida entre dois admins.
const approveUser = sqlite.prepare(
  "UPDATE users SET approval_status = 'approved', rejection_reason = NULL WHERE id = ? AND approval_status = 'pending'",
);
const rejectUser = sqlite.prepare(
  `UPDATE users
   SET approval_status = 'rejected', apartment_id = NULL, rejection_reason = @rejection_reason
   WHERE id = @id AND approval_status = 'pending'`,
);

function alreadyResolvedResponse(res, target) {
  const decision = target.approval_status === "rejected" ? "rejected" : "approved";
  const verb = decision === "rejected" ? "rejeitado" : "aprovado";
  const auditAction = decision === "rejected" ? "users.reject" : "users.approve";
  const entry = getLastApprovalDecision.get({ entityId: target.id, action: auditAction });

  let decidedByName = entry?.actorName || null;
  let decidedById = entry?.actorUserId || null;
  if (decidedById) {
    const current = getAdminNameById.get(decidedById);
    if (current?.name) decidedByName = current.name;
  }
  if (!decidedByName) decidedByName = "outro administrador";

  return res.status(409).json({
    code: "already_resolved",
    message: `O usuário ${target.name} foi ${verb} pelo administrador ${decidedByName}.`,
    user: { id: target.id, name: target.name },
    decision,
    decidedBy: { id: decidedById, name: decidedByName },
  });
}

export function usersRoutes() {
  const router = Router();

  router.get("/", requireStaff, (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const towerRaw = req.query.tower != null && String(req.query.tower).trim() !== ""
      ? Number(req.query.tower)
      : null;
    const tower = towerRaw != null && Number.isInteger(towerRaw) && towerRaw >= 1 && towerRaw <= 5
      ? towerRaw
      : null;
    const apartmentRaw = req.query.apartment ? String(req.query.apartment).trim() : "";
    const apartment = apartmentRaw ? `%${apartmentRaw}%` : null;
    const approvalRaw = req.query.approvalStatus ? String(req.query.approvalStatus).trim() : "";
    const approvalStatus = ["pending", "approved", "rejected"].includes(approvalRaw) ? approvalRaw : null;

    const filters = { tower, apartment, approvalStatus };
    const total = countUsers.get(filters).c;
    const users = listUsersPage
      .all({ ...filters, limit: pageSize, offset: (page - 1) * pageSize })
      .map((u) => ({ ...u, whatsappVisible: Boolean(u.whatsappVisible) }));

    res.json({ users, total, page, pageSize });
  });

  // Detalhe pra deep-link da auditoria (/admin/usuarios?user=…).
  router.get("/:id", requireStaff, (req, res) => {
    const user = getManagedUserById.get(req.params.id);
    if (!user) return res.status(404).json({ message: "Usuário não encontrado." });
    res.json({ user: { ...user, whatsappVisible: Boolean(user.whatsappVisible) } });
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
    if (target.approval_status !== "pending") {
      return alreadyResolvedResponse(res, target);
    }

    const result = approveUser.run(target.id);
    if (result.changes === 0) {
      // Outro admin ganhou a corrida entre o SELECT e o UPDATE.
      const fresh = getUserById.get(target.id);
      return alreadyResolvedResponse(res, fresh ?? target);
    }

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
    sendEmail({ to: target.email, ...registrationApprovedEmail({ name: target.name }) });
    res.status(204).end();
  });

  router.patch("/:id/reject", requireAdmin, (req, res) => {
    const target = getUserById.get(req.params.id);
    if (!target) return res.status(404).json({ message: "Usuário não encontrado." });
    if (target.approval_status !== "pending") {
      return alreadyResolvedResponse(res, target);
    }

    const parsed = rejectSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "Motivo inválido (máx. 500 caracteres)." });
    }
    const reason = parsed.data.reason?.trim() || null;

    const result = rejectUser.run({ id: target.id, rejection_reason: reason });
    if (result.changes === 0) {
      const fresh = getUserById.get(target.id);
      return alreadyResolvedResponse(res, fresh ?? target);
    }

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "users.reject",
      entityType: "user",
      entityId: target.id,
      details: { freedApartmentId: target.apartment_id, reason },
    });
    sendEmail({
      to: target.email,
      ...registrationRejectedEmail({ name: target.name, reason }),
    });
    res.status(204).end();
  });

  // Admin troca o e-mail do morador (ou síndico). Avisa o e-mail antigo e o novo via Resend,
  // no mesmo padrão "fire and forget" do reset de senha.
  router.patch("/:id/email", requireAdmin, (req, res) => {
    const target = getUserById.get(req.params.id);
    if (!target) return res.status(404).json({ message: "Usuário não encontrado." });
    if (target.role === "admin") {
      return res.status(400).json({ message: "Não é possível alterar o e-mail do administrador por aqui." });
    }

    const parsed = changeEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Informe um e-mail válido." });
    }

    const newEmail = parsed.data.email;
    if (newEmail === target.email) {
      return res.status(400).json({ message: "O e-mail informado já é o atual." });
    }
    if (getUserByEmail.get(newEmail)) {
      return res.status(409).json({ message: "Já existe uma conta com este e-mail." });
    }

    const oldEmail = target.email;
    try {
      updateEmail.run(newEmail, target.id);
    } catch (err) {
      if (String(err.message).includes("UNIQUE")) {
        return res.status(409).json({ message: "Já existe uma conta com este e-mail." });
      }
      throw err;
    }

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "users.email_change",
      entityType: "user",
      entityId: target.id,
      details: { from: oldEmail, to: newEmail },
    });

    notifyUser({
      userId: target.id,
      topicId: null,
      message: `Seu e-mail foi atualizado para ${newEmail}.`,
      linkUrl: "/perfil",
    });

    const mail = emailChangedEmail({ name: target.name, oldEmail, newEmail });
    sendEmail({ to: newEmail, ...mail });
    if (oldEmail !== newEmail) {
      sendEmail({ to: oldEmail, ...mail });
    }

    res.json({ user: { id: target.id, email: newEmail } });
  });

  // Reset assistido: sindico só reseta senha de morador/conselheiro; admin reseta síndico,
  // conselheiro ou morador; ninguém reseta o admin. Não gera mais senha nenhuma aqui — só um
  // token de uso único (1h), mandado por e-mail num link pra pessoa escolher a própria senha
  // nova (POST /auth/reset-password, ver server/src/modules/auth/passwordReset.js).
  router.patch("/:id/reset-password", requireStaff, (req, res) => {
    const target = getUserById.get(req.params.id);
    if (!target) return res.status(404).json({ message: "Usuário não encontrado." });
    if (target.role === "admin") {
      return res.status(400).json({ message: "Não é possível resetar a senha do administrador." });
    }
    if (
      req.user.role === "sindico" &&
      target.role !== "morador" &&
      target.role !== "conselheiro"
    ) {
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
