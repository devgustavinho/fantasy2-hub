/** Fuso do condomínio (sem horário de verão). */
export const CONDO_TZ = "America/Fortaleza";

const WEEKDAY_TO_JS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * Partes de data/hora em America/Fortaleza.
 * @param {Date} [date]
 */
export function fortalezaParts(date = new Date()) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: CONDO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${hour}:${parts.minute}`,
    day: WEEKDAY_TO_JS[parts.weekday] ?? 0,
  };
}

/** Soma dias a uma data YYYY-MM-DD. */
export function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  const yy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(utc.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Compara HH:MM (strings). */
export function timeGte(a, b) {
  return a >= b;
}

export function timeLt(a, b) {
  return a < b;
}

/**
 * Está dentro de [opens, closes)? Se closes <= opens, trata como atravessa meia-noite.
 */
export function inTimeRange(nowHm, opensAt, closesAt) {
  if (!opensAt || !closesAt) return false;
  if (closesAt > opensAt) {
    return timeGte(nowHm, opensAt) && timeLt(nowHm, closesAt);
  }
  // atravessa meia-noite
  return timeGte(nowHm, opensAt) || timeLt(nowHm, closesAt);
}

/** HH:MM válido. */
export function isHm(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
}
