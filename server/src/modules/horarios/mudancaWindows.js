import { inTimeRange } from "./time.js";

/** Lista intervalos de janelas como "08:00–12:00 · 14:00–18:00". */
export function formatWindowRanges(windows) {
  return windows.map((w) => `${w.opensAt}–${w.closesAt}`).join(" · ");
}

/**
 * Avalia TODAS as janelas do dia (não só a primeira).
 * @param {number} dayOfWeek 0=Dom … 6=Sáb
 * @param {string|null} timeHm HH:MM atual, ou null = só checar se o dia tem janela
 * @param {{days:number[],opensAt:string,closesAt:string}[]} windows
 */
export function evaluateMudancaWindows(dayOfWeek, timeHm, windows) {
  const dayWindows = windows.filter((w) => w.days.includes(dayOfWeek));
  if (dayWindows.length === 0) {
    return {
      allowed: false,
      reason: "Sem janela de mudança neste dia da semana.",
      window: null,
    };
  }
  if (timeHm == null) {
    return {
      allowed: true,
      reason: `Permitido (${formatWindowRanges(dayWindows)}).`,
      window: dayWindows[0],
    };
  }
  const matching = dayWindows.find((w) => inTimeRange(timeHm, w.opensAt, w.closesAt));
  if (!matching) {
    return {
      allowed: false,
      reason: `Fora da janela (${formatWindowRanges(dayWindows)}).`,
      window: dayWindows[0],
    };
  }
  return {
    allowed: true,
    reason: `Dentro da janela (${matching.opensAt}–${matching.closesAt}).`,
    window: matching,
  };
}
