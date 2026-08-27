import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { sqlite } from "../../db/client.js";
import { hashPassword, verifyPassword } from "../../auth/password.js";
import { requireAuth, requireApproved } from "../../auth/guards.js";
import { toPublicUser } from "../../auth/publicUser.js";
import { establishSession, confirmTotpSetup, verifyTotpLogin } from "../../auth/twoFactor.js";
import { recordAudit } from "../audit/service.js";
import { notifyAdmins } from "../notifications/service.js";

const registerSchema = z.object({
  apartmentId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

const totpSchema = z.object({
  token: z.string().min(1),
  code: z.string().trim().min(6).max(6),
});

const meUpdateSchema = z.object({
  whatsapp: z.string().trim().max(30).nullable().optional(),
  whatsappVisible: z.boolean().optional(),
});

const familyMemberSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
});

const getApartment = sqlite.prepare("SELECT id, tower, code FROM apartments WHERE id = ?");
const getApartmentOwner = sqlite.prepare("SELECT id FROM users WHERE apartment_id = ?");
const getUserByEmail = sqlite.prepare("SELECT * FROM users WHERE email = ?");
const insertUser = sqlite.prepare(`
  INSERT INTO users (id, apartment_id, name, email, password_hash, role, approval_status)
  VALUES (@id, @apartment_id, @name, @email, @password_hash, 'morador', 'pending')
`);
const updateMe = sqlite.prepare(
  "UPDATE users SET whatsapp = @whatsapp, whatsapp_visible = @whatsapp_visible WHERE id = @id",
);
const getFamilyMemberByApartment = sqlite.prepare(
  "SELECT id, name, email FROM users WHERE apartment_id = ? AND household_role = 'family'",
);
const insertFamilyMember = sqlite.prepare(`
  INSERT INTO users (id, apartment_id, name, email, password_hash, role, household_role, approval_status, invited_by)
  VALUES (@id, @apartment_id, @name, @email, @password_hash, 'morador', 'family', 'approved', @invited_by)
`);

export { toPublicUser };

export function authRoutes() {
  const router = Router();

  router.post("/register", async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Dados inválidos.", issues: parsed.error.issues });
    }
    const { apartmentId, name, email, password } = parsed.data;

    const apartment = getApartment.get(apartmentId);
    if (!apartment) {
      return res.status(404).json({ message: "Apartamento não encontrado." });
    }
    if (getApartmentOwner.get(apartmentId)) {
      return res.status(409).json({ message: "Este apartamento já está cadastrado." });
    }
    if (getUserByEmail.get(email)) {
      return res.status(409).json({ message: "Já existe uma conta com este e-mail." });
    }

    const passwordHash = await hashPassword(password);
    const userId = randomUUID();

    try {
      insertUser.run({
        id: userId,
        apartment_id: apartmentId,
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
      actorUserId: userId,
      actorName: name,
      action: "auth.register",
      entityType: "user",
      entityId: userId,
      details: { email, apartmentId },
    });

    notifyAdmins({
      message: `${name} (apto ${apartment.code}, torre ${apartment.tower}) se cadastrou e está aguardando aprovação.`,
      url: "/admin/usuarios",
    });

    res.status(201).json({ status: "pending" });
  });

  router.post("/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Informe e-mail e senha." });
    }
    const { email, password } = parsed.data;

    const user = getUserByEmail.get(email);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ message: "E-mail ou senha incorretos." });
    }

    recordAudit({ actorUserId: user.id, actorName: user.name, action: "auth.login", entityType: "user", entityId: user.id });
    res.json(await establishSession(user));
  });

  router.post("/2fa/setup/confirm", (req, res) => {
    const parsed = totpSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Informe o código de 6 dígitos." });

    const result = confirmTotpSetup(parsed.data.token, parsed.data.code);
    if (result.error) return res.status(400).json({ message: result.error });

    recordAudit({
      actorUserId: result.user.id,
      actorName: result.user.name,
      action: "auth.2fa_enabled",
      entityType: "user",
      entityId: result.user.id,
    });
    res.json({ status: "ok", user: result.user, token: result.token });
  });

  router.post("/2fa/verify", (req, res) => {
    const parsed = totpSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Informe o código de 6 dígitos." });

    const result = verifyTotpLogin(parsed.data.token, parsed.data.code);
    if (result.error) return res.status(400).json({ message: result.error });

    res.json({ status: "ok", user: result.user, token: result.token });
  });

  // Sessão é um JWT stateless (sem cookie pra limpar) — o front só precisa esquecer o token
  // guardado localmente. Endpoint mantido por compatibilidade e caso um dia vire necessário
  // revogar tokens do lado do servidor (ex. blocklist).
  router.post("/logout", (_req, res) => {
    res.status(204).end();
  });

  router.get("/me", requireAuth, (req, res) => {
    res.json({ user: toPublicUser(req.user) });
  });

  router.patch("/me", requireAuth, (req, res) => {
    const parsed = meUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos." });

    const whatsapp = parsed.data.whatsapp !== undefined ? parsed.data.whatsapp : req.user.whatsapp;
    const whatsappVisible =
      parsed.data.whatsappVisible !== undefined ? parsed.data.whatsappVisible : Boolean(req.user.whatsapp_visible);

    updateMe.run({ id: req.user.id, whatsapp: whatsapp || null, whatsapp_visible: whatsappVisible ? 1 : 0 });
    res.json({
      user: toPublicUser({ ...req.user, whatsapp: whatsapp || null, whatsapp_visible: whatsappVisible ? 1 : 0 }),
    });
  });

  router.get("/family-member", requireAuth, requireApproved, (req, res) => {
    if (req.user.household_role !== "owner" || !req.user.apartment_id) {
      return res.json({ familyMember: null });
    }
    res.json({ familyMember: getFamilyMemberByApartment.get(req.user.apartment_id) ?? null });
  });

  // Só o titular do apartamento (household_role='owner') convida — e só 1 familiar por
  // apartamento (reforçado também pelo índice único `idx_users_apartment_household`). A conta
  // já nasce aprovada: o titular já é um morador verificado e está pessoalmente respondendo por
  // quem está convidando, não precisa passar pela fila de aprovação do admin de novo.
  router.post("/family-member", requireAuth, requireApproved, async (req, res) => {
    if (req.user.household_role !== "owner" || !req.user.apartment_id) {
      return res.status(403).json({ message: "Só o responsável pelo apartamento pode convidar um familiar." });
    }
    if (getFamilyMemberByApartment.get(req.user.apartment_id)) {
      return res.status(409).json({ message: "Este apartamento já tem um familiar cadastrado." });
    }

    const parsed = familyMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Preencha nome, e-mail e senha do familiar." });
    }
    if (getUserByEmail.get(parsed.data.email)) {
      return res.status(409).json({ message: "Já existe uma conta com este e-mail." });
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const id = randomUUID();
    try {
      insertFamilyMember.run({
        id,
        apartment_id: req.user.apartment_id,
        name: parsed.data.name,
        email: parsed.data.email,
        password_hash: passwordHash,
        invited_by: req.user.id,
      });
    } catch (err) {
      if (String(err.message).includes("UNIQUE")) {
        return res.status(409).json({ message: "Este apartamento já tem um familiar cadastrado, ou o e-mail já existe." });
      }
      throw err;
    }

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "auth.family_member_invite",
      entityType: "user",
      entityId: id,
      details: { name: parsed.data.name, email: parsed.data.email, apartmentId: req.user.apartment_id },
    });

    res.status(201).json({ familyMember: { id, name: parsed.data.name, email: parsed.data.email } });
  });

  return router;
}
