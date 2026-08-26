import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { sqlite } from "../../db/client.js";
import { hashPassword, verifyPassword } from "../../auth/password.js";
import { SESSION_COOKIE } from "../../auth/jwt.js";
import { requireAuth } from "../../auth/guards.js";
import { toPublicUser } from "../../auth/publicUser.js";
import { establishSession, confirmTotpSetup, verifyTotpLogin } from "../../auth/twoFactor.js";
import { recordAudit } from "../audit/service.js";

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

const getApartment = sqlite.prepare("SELECT id FROM apartments WHERE id = ?");
const getApartmentOwner = sqlite.prepare("SELECT id FROM users WHERE apartment_id = ?");
const getUserByEmail = sqlite.prepare("SELECT * FROM users WHERE email = ?");
const insertUser = sqlite.prepare(`
  INSERT INTO users (id, apartment_id, name, email, password_hash, role, approval_status)
  VALUES (@id, @apartment_id, @name, @email, @password_hash, 'morador', 'pending')
`);
const updateMe = sqlite.prepare(
  "UPDATE users SET whatsapp = @whatsapp, whatsapp_visible = @whatsapp_visible WHERE id = @id",
);

export { toPublicUser };

export function authRoutes() {
  const router = Router();

  router.post("/register", async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Dados inválidos.", issues: parsed.error.issues });
    }
    const { apartmentId, name, email, password } = parsed.data;

    if (!getApartment.get(apartmentId)) {
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
    res.json(await establishSession(res, user));
  });

  router.post("/2fa/setup/confirm", (req, res) => {
    const parsed = totpSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Informe o código de 6 dígitos." });

    const result = confirmTotpSetup(res, parsed.data.token, parsed.data.code);
    if (result.error) return res.status(400).json({ message: result.error });

    recordAudit({
      actorUserId: result.user.id,
      actorName: result.user.name,
      action: "auth.2fa_enabled",
      entityType: "user",
      entityId: result.user.id,
    });
    res.json({ status: "ok", user: result.user });
  });

  router.post("/2fa/verify", (req, res) => {
    const parsed = totpSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Informe o código de 6 dígitos." });

    const result = verifyTotpLogin(res, parsed.data.token, parsed.data.code);
    if (result.error) return res.status(400).json({ message: result.error });

    res.json({ status: "ok", user: result.user });
  });

  router.post("/logout", (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: "/" });
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

  return router;
}
