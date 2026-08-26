import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { sqlite } from "../../db/client.js";
import { hashPassword, verifyPassword } from "../../auth/password.js";
import { signSession, sessionCookieOptions, SESSION_COOKIE } from "../../auth/jwt.js";
import { requireAuth } from "../../auth/guards.js";

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

const getApartment = sqlite.prepare("SELECT id FROM apartments WHERE id = ?");
const getApartmentOwner = sqlite.prepare("SELECT id FROM users WHERE apartment_id = ?");
const getUserByEmail = sqlite.prepare(
  "SELECT id, apartment_id, name, email, password_hash, role FROM users WHERE email = ?",
);
const insertUser = sqlite.prepare(`
  INSERT INTO users (id, apartment_id, name, email, password_hash, role)
  VALUES (@id, @apartment_id, @name, @email, @password_hash, 'morador')
`);

function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    apartmentId: user.apartment_id,
  };
}

function setSessionCookie(res, userId) {
  const token = signSession({ sub: userId });
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions);
}

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

    setSessionCookie(res, userId);
    res.status(201).json({
      user: { id: userId, name, email, role: "morador", apartmentId },
    });
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

    setSessionCookie(res, user.id);
    res.json({ user: toPublicUser(user) });
  });

  router.post("/logout", (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.status(204).end();
  });

  router.get("/me", requireAuth, (req, res) => {
    res.json({ user: toPublicUser(req.user) });
  });

  return router;
}
