import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { sqlite } from "../../db/client.js";
import { hashPassword } from "../../auth/password.js";
import { requireAdmin } from "../../auth/guards.js";

const createSindicoSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
  apartmentId: z.string().min(1).nullable().optional(),
});

const changeRoleSchema = z.object({
  role: z.enum(["sindico", "morador"]),
});

const listUsers = sqlite.prepare(`
  SELECT
    u.id, u.name, u.email, u.role, u.created_at AS createdAt,
    a.tower, a.code AS apartmentCode
  FROM users u
  LEFT JOIN apartments a ON a.id = u.apartment_id
  ORDER BY u.created_at ASC
`);

const getUserById = sqlite.prepare("SELECT id, role FROM users WHERE id = ?");
const getApartment = sqlite.prepare("SELECT id FROM apartments WHERE id = ?");
const getApartmentOwner = sqlite.prepare("SELECT id FROM users WHERE apartment_id = ?");
const getUserByEmail = sqlite.prepare("SELECT id FROM users WHERE email = ?");

const insertUser = sqlite.prepare(`
  INSERT INTO users (id, apartment_id, name, email, password_hash, role)
  VALUES (@id, @apartment_id, @name, @email, @password_hash, 'sindico')
`);

const updateRole = sqlite.prepare("UPDATE users SET role = ? WHERE id = ?");

export function usersRoutes() {
  const router = Router();
  router.use(requireAdmin);

  router.get("/", (_req, res) => {
    res.json({ users: listUsers.all() });
  });

  router.post("/", async (req, res) => {
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

    res.status(201).json({ user: { id, name, email, role: "sindico", apartmentId: apartmentId ?? null } });
  });

  router.patch("/:id/role", (req, res) => {
    const target = getUserById.get(req.params.id);
    if (!target) return res.status(404).json({ message: "Usuário não encontrado." });
    if (target.role === "admin") {
      return res.status(400).json({ message: "Não é possível alterar o cargo do administrador." });
    }

    const parsed = changeRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Cargo inválido." });
    }

    updateRole.run(parsed.data.role, target.id);
    res.json({ user: { id: target.id, role: parsed.data.role } });
  });

  return router;
}
