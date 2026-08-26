import { randomUUID } from "node:crypto";
import { sqlite } from "./client.js";

const TOWERS = [1, 2, 3, 4, 5];
const FLOORS = [0, 1, 2, 3, 4, 5, 6, 7];
const UNITS = [1, 2, 3, 4, 5, 6, 7, 8];

function floorLabel(floor) {
  if (floor === 0) return "Garden";
  if (floor === 7) return "Cobertura";
  return `${floor}º andar`;
}

function code(floor, unitNumber) {
  return `${floor}${String(unitNumber).padStart(2, "0")}`;
}

const insert = sqlite.prepare(`
  INSERT INTO apartments (id, tower, floor, unit_number, code, label)
  VALUES (@id, @tower, @floor, @unit_number, @code, @label)
`);

const exists = sqlite.prepare(
  "SELECT 1 FROM apartments WHERE tower = ? AND floor = ? AND unit_number = ?",
);

let created = 0;
const seedAll = sqlite.transaction(() => {
  for (const tower of TOWERS) {
    for (const floor of FLOORS) {
      for (const unitNumber of UNITS) {
        if (exists.get(tower, floor, unitNumber)) continue;
        const c = code(floor, unitNumber);
        insert.run({
          id: randomUUID(),
          tower,
          floor,
          unit_number: unitNumber,
          code: c,
          label: `Torre ${tower} - ${c} (${floorLabel(floor)})`,
        });
        created += 1;
      }
    }
  }
});

seedAll();

console.log(
  created === 0
    ? "apartments já estavam populados (320 unidades esperadas)"
    : `${created} apartamento(s) inserido(s)`,
);
