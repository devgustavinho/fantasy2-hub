import { Router } from "express";
import { z } from "zod";
import { sqlite } from "../../db/client.js";

const querySchema = z.object({
  tower: z.coerce.number().int().min(1).max(5),
});

const listByTower = sqlite.prepare(`
  SELECT
    a.id,
    a.tower,
    a.floor,
    a.unit_number AS unitNumber,
    a.code,
    a.label,
    (u.id IS NULL) AS available
  FROM apartments a
  LEFT JOIN users u ON u.apartment_id = a.id
  WHERE a.tower = ?
  ORDER BY a.floor ASC, a.unit_number ASC
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

  return router;
}
