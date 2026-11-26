/**
 * Smoke: lógica de barulho + fuso Fortaleza independente do TZ do processo.
 *
 *   TZ=Europe/Berlin node src/modules/horarios/noise.selftest.js
 *   TZ=UTC node src/modules/horarios/noise.selftest.js
 */
import assert from "node:assert/strict";
import { evaluateNoise } from "./noise.js";
import { fortalezaParts } from "./time.js";

const FROM = "07:00";
const UNTIL = "22:00";

/** Constrói um Instant cujo wall-clock em America/Fortaleza é date+hm. Fortaleza = UTC−3 o ano todo. */
function instantAtFortaleza(isoDate, hm) {
  const [y, mo, d] = isoDate.split("-").map(Number);
  const [h, mi] = hm.split(":").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h + 3, mi, 0));
}

const cases = [
  { hm: "01:00", allowed: false },
  { hm: "06:59", allowed: false },
  { hm: "07:00", allowed: true },
  { hm: "21:59", allowed: true },
  { hm: "22:00", allowed: false },
  { hm: "23:30", allowed: false },
];

for (const { hm, allowed } of cases) {
  const r = evaluateNoise(hm, FROM, UNTIL);
  assert.equal(r.allowed, allowed, `evaluateNoise(${hm})`);
  assert.equal(
    r.reason,
    allowed ? `Permitido até ${UNTIL}` : `Silêncio até ${FROM}`,
    `reason(${hm})`,
  );
}

// Validação de faixa: noise_from < noise_until (comparação lexicográfica HH:MM)
assert.ok(FROM < UNTIL);

const sampleDate = "2026-03-15"; // domingo, sem DST em Fortaleza
for (const { hm, allowed } of cases) {
  const instant = instantAtFortaleza(sampleDate, hm);
  const parts = fortalezaParts(instant);
  assert.equal(parts.date, sampleDate, `date for ${hm}`);
  assert.equal(parts.time, hm, `time for ${hm} under TZ=${process.env.TZ || "(unset)"}`);
  const r = evaluateNoise(parts.time, FROM, UNTIL);
  assert.equal(r.allowed, allowed, `noise via fortalezaParts(${hm})`);
}

console.log(`noise selftest ok (TZ=${process.env.TZ || "(unset)"})`);
