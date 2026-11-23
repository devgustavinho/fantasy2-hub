/** Só dígitos (E.164 sem +). */
export function digitsOnly(value) {
  return String(value || "").replace(/\D+/g, "");
}

/**
 * Extrai número de um JID WhatsApp (`5585…@c.us`, `…@lid`, `…@s.whatsapp.net`).
 * Para `@lid` devolve o prefixo antes do @ (pode não ser telefone).
 */
export function phoneFromJid(jid) {
  if (!jid) return "";
  const base = String(jid).split("@")[0] || "";
  // Alguns engines usam `phone:device` ou `true_phone`.
  const cleaned = base.includes(":") ? base.split(":")[0] : base;
  return digitsOnly(cleaned);
}

export function isGroupJid(jid) {
  return String(jid || "").endsWith("@g.us");
}

export function toChatId(phoneOrJid) {
  const s = String(phoneOrJid || "").trim();
  if (!s) return "";
  if (s.includes("@")) return s.replace(/@s\.whatsapp\.net$/i, "@c.us");
  return `${digitsOnly(s)}@c.us`;
}

/** Compara dois números/JIDs ignorando sufixo e formatação. */
export function phonesMatch(a, b) {
  const da = digitsOnly(a);
  const db = digitsOnly(b);
  if (!da || !db) return false;
  if (da === db) return true;
  // BR: às vezes vem com/sem o 9 extra depois do DDD.
  const short = da.length < db.length ? da : db;
  const long = da.length < db.length ? db : da;
  if (long.endsWith(short) && long.length - short.length <= 3) return true;
  return false;
}

/** CSV de números → Set de dígitos. */
export function parseAllowlist(csv) {
  return new Set(
    String(csv || "")
      .split(/[,;\s]+/)
      .map((p) => digitsOnly(p))
      .filter(Boolean),
  );
}

export function isAllowlisted(phone, allowlistCsv) {
  const set = parseAllowlist(allowlistCsv);
  if (set.size === 0) return false;
  const dig = digitsOnly(phone);
  for (const allowed of set) {
    if (phonesMatch(dig, allowed)) return true;
  }
  return false;
}
