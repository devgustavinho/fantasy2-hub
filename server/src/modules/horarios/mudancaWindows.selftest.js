/**
 * Smoke puro (sem DB): node src/modules/horarios/mudancaWindows.selftest.js
 *
 * Cobre o bug: várias janelas no mesmo dia (ex. Seg–Sex 08–12 e 14–18)
 * devem ser avaliadas todas — não só a primeira via Array#find.
 */
import assert from "node:assert/strict";
import { evaluateMudancaWindows, formatWindowRanges } from "./mudancaWindows.js";

const WEEKDAYS = [1, 2, 3, 4, 5]; // Seg–Sex
const windows = [
  { days: WEEKDAYS, opensAt: "08:00", closesAt: "12:00" },
  { days: [6], opensAt: "08:00", closesAt: "12:00" },
  { days: WEEKDAYS, opensAt: "14:00", closesAt: "18:00" },
];

assert.equal(formatWindowRanges(windows.slice(0, 1)), "08:00–12:00");
assert.equal(
  formatWindowRanges([windows[0], windows[2]]),
  "08:00–12:00 · 14:00–18:00",
);

// Quarta (3) às 14:24 — dentro da 2ª janela do dia (14–18), não da 1ª (08–12)
{
  const r = evaluateMudancaWindows(3, "14:24", windows);
  assert.equal(r.allowed, true);
  assert.equal(r.reason, "Dentro da janela (14:00–18:00).");
  assert.deepEqual(r.window, windows[2]);
}

// Quarta às 10:00 — primeira janela
{
  const r = evaluateMudancaWindows(3, "10:00", windows);
  assert.equal(r.allowed, true);
  assert.equal(r.reason, "Dentro da janela (08:00–12:00).");
  assert.deepEqual(r.window, windows[0]);
}

// Quarta às 13:00 — entre as duas: fora, mas copy lista ambas
{
  const r = evaluateMudancaWindows(3, "13:00", windows);
  assert.equal(r.allowed, false);
  assert.equal(r.reason, "Fora da janela (08:00–12:00 · 14:00–18:00).");
  assert.deepEqual(r.window, windows[0]);
}

// Sábado manhã — só a janela de Sáb
{
  const r = evaluateMudancaWindows(6, "09:00", windows);
  assert.equal(r.allowed, true);
  assert.equal(r.reason, "Dentro da janela (08:00–12:00).");
}

// Domingo — sem janela
{
  const r = evaluateMudancaWindows(0, "10:00", windows);
  assert.equal(r.allowed, false);
  assert.match(r.reason, /Sem janela/);
  assert.equal(r.window, null);
}

// Dia com janelas, sem horário (status "amanhã"): lista todas
{
  const r = evaluateMudancaWindows(3, null, windows);
  assert.equal(r.allowed, true);
  assert.equal(r.reason, "Permitido (08:00–12:00 · 14:00–18:00).");
}

console.log("mudanca windows selftest ok");
