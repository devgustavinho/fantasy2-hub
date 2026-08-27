import { Router } from "express";
import { z } from "zod";
import { sqlite } from "../../db/client.js";
import { requireAuth, requireAdmin } from "../../auth/guards.js";

const querySchema = z.object({
  tower: z.coerce.number().int().min(1).max(5),
});

// `NOT EXISTS` em vez de `LEFT JOIN u` direto: agora que um apartamento pode ter 2 usuários
// (titular + familiar), um LEFT JOIN devolveria a mesma linha duplicada quando os dois já
// existem — quebrando a lista de apartamentos livres pro cadastro.
const listByTower = sqlite.prepare(`
  SELECT
    a.id,
    a.tower,
    a.floor,
    a.unit_number AS unitNumber,
    a.code,
    a.label,
    NOT EXISTS (SELECT 1 FROM users u WHERE u.apartment_id = a.id) AS available
  FROM apartments a
  WHERE a.tower = ?
  ORDER BY a.floor ASC, a.unit_number ASC
`);

const listResidentsByTower = sqlite.prepare(`
  SELECT
    a.id AS apartmentId, a.floor, a.unit_number AS unitNumber, a.code,
    u.id AS userId, u.name AS userName, u.household_role AS householdRole,
    u.approval_status AS approvalStatus
  FROM apartments a
  LEFT JOIN users u ON u.apartment_id = a.id
  WHERE a.tower = ?
  ORDER BY a.floor ASC, a.unit_number ASC, u.household_role ASC
`);

export function apartmentsRoutes() {
  const router = Router();

  router.get("/", (req, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "Informe a torre (1 a 5)." });
    }
    const rows = listByTower.all(parsed.data.tower).map((row) => ({
      ...row,
      available: Boolean(row.available),
    }));
    res.json({ apartments: rows });
  });

  // Mapa de apartamentos por torre, pra administração não se perder em meio a centenas de
  // usuários — mostra quem mora em cada unidade (titular + familiar, se houver).
  router.get("/map", requireAuth, requireAdmin, (req, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "Informe a torre (1 a 5)." });
    }

    const rows = listResidentsByTower.all(parsed.data.tower);
    const byApartment = new Map();
    for (const row of rows) {
      if (!byApartment.has(row.apartmentId)) {
        byApartment.set(row.apartmentId, {
          id: row.apartmentId,
          floor: row.floor,
          unitNumber: row.unitNumber,
          code: row.code,
          residents: [],
        });
      }
      if (row.userId) {
        const residents = byApartment.get(row.apartmentId).residents;
        const resident = {
          id: row.userId,
          name: row.userName,
          householdRole: row.householdRole,
          approvalStatus: row.approvalStatus,
        };
        // titular sempre primeiro na lista, independente da ordem que veio do banco
        if (resident.householdRole === "owner") residents.unshift(resident);
        else residents.push(resident);
      }
    }

    res.json({ apartments: Array.from(byApartment.values()) });
  });

  return router;
}
