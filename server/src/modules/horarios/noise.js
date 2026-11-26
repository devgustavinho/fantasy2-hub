/**
 * Avalia se barulho é permitido no horário HH:MM dado.
 * Janela: [noiseFrom, noiseUntil) — nunca atravessa meia-noite.
 */
export function evaluateNoise(timeHm, noiseFrom, noiseUntil) {
  const from = String(noiseFrom || "07:00");
  const until = String(noiseUntil || "22:00");
  const allowed = timeHm >= from && timeHm < until;
  return {
    allowed,
    noiseFrom: from,
    noiseUntil: until,
    reason: allowed ? `Permitido até ${until}` : `Silêncio até ${from}`,
  };
}
