import { randomUUID } from "node:crypto";
import { sqlite } from "../../db/client.js";
import { fortalezaParts } from "./time.js";

/** Algoritmo anônimo gregoriano → domingo de Páscoa. */
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

function ymd(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDaysYmd(year, month, day, delta) {
  const dt = new Date(Date.UTC(year, month - 1, day + delta));
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/**
 * Feriados nacionais + Fortaleza para um ano.
 * @returns {{ date: string, reason: string, source: 'national'|'fortaleza' }[]}
 */
export function holidaysForYear(year) {
  const easter = easterSunday(year);
  const list = [
    { date: ymd(year, 1, 1), reason: "Confraternização Universal", source: "national" },
    {
      date: addDaysYmd(easter.year, easter.month, easter.day, -48),
      reason: "Carnaval (segunda)",
      source: "national",
    },
    {
      date: addDaysYmd(easter.year, easter.month, easter.day, -47),
      reason: "Carnaval (terça)",
      source: "national",
    },
    {
      date: addDaysYmd(easter.year, easter.month, easter.day, -2),
      reason: "Sexta-feira Santa",
      source: "national",
    },
    { date: ymd(year, 4, 21), reason: "Tiradentes", source: "national" },
    { date: ymd(year, 5, 1), reason: "Dia do Trabalho", source: "national" },
    {
      date: addDaysYmd(easter.year, easter.month, easter.day, 60),
      reason: "Corpus Christi",
      source: "national",
    },
    { date: ymd(year, 9, 7), reason: "Independência do Brasil", source: "national" },
    { date: ymd(year, 10, 12), reason: "Nossa Senhora Aparecida", source: "national" },
    { date: ymd(year, 11, 2), reason: "Finados", source: "national" },
    { date: ymd(year, 11, 15), reason: "Proclamação da República", source: "national" },
    { date: ymd(year, 11, 20), reason: "Dia da Consciência Negra", source: "national" },
    { date: ymd(year, 12, 25), reason: "Natal", source: "national" },
    // Fortaleza
    { date: ymd(year, 4, 13), reason: "Aniversário de Fortaleza", source: "fortaleza" },
    { date: ymd(year, 8, 15), reason: "Nossa Senhora da Assunção (Fortaleza)", source: "fortaleza" },
  ];
  return list;
}

const insertIgnore = sqlite.prepare(`
  INSERT OR IGNORE INTO mudanca_blocked_days (id, day_date, reason, source, created_by)
  VALUES (@id, @day_date, @reason, @source, NULL)
`);

/** Garante feriados nacionais + Fortaleza nos próximos `years` a partir do ano atual (Fortaleza). */
export function ensureHolidaySeed(years = 5) {
  const { date } = fortalezaParts();
  const startYear = Number(date.slice(0, 4));
  const insertMany = sqlite.transaction((rows) => {
    for (const row of rows) {
      insertIgnore.run({
        id: randomUUID(),
        day_date: row.date,
        reason: row.reason,
        source: row.source,
      });
    }
  });

  const rows = [];
  for (let y = startYear; y < startYear + years; y += 1) {
    rows.push(...holidaysForYear(y));
  }
  insertMany(rows);
}
