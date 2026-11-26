import { createHash, randomBytes } from "node:crypto";

export const API_TOKEN_PREFIX = "f2h_";
/** Prefixo visível na listagem (f2h_ + 8 chars do material aleatório). */
export const DISPLAY_PREFIX_LENGTH = 12;
export const MAX_ACTIVE_TOKENS = 5;
/** Síndico/admin: validade obrigatória, teto 90 dias (granularidade de dia UTC). */
export const STAFF_TOKEN_TTL_DAYS = 90;
/**
 * Morador/conselheiro: expiração opcional; se informada, teto de 365 dias
 * (política documentada em mcp/README.md e server/README.md).
 */
export const RESIDENT_TOKEN_MAX_TTL_DAYS = 365;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function hashApiToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

/** Gera `f2h_` + 32 bytes aleatórios em base64url. Valor em claro só existe aqui. */
export function generateApiToken() {
  const token = `${API_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  return {
    token,
    prefix: token.slice(0, DISPLAY_PREFIX_LENGTH),
    tokenHash: hashApiToken(token),
  };
}

export function isApiTokenFormat(token) {
  return typeof token === "string" && token.startsWith(API_TOKEN_PREFIX);
}

/** Início do dia UTC que contém `ms`. */
export function utcDayStartMs(ms) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Fim do dia UTC (23:59:59.999) de `todayUtc + maxDays`. */
export function maxExpiryEndOfUtcDayMs(nowMs, maxDays) {
  const start = utcDayStartMs(nowMs);
  return start + maxDays * MS_PER_DAY + (MS_PER_DAY - 1);
}

/**
 * Replica o default da UI: `daysFromNowIso(N)` → date input → `T23:59:59.000Z`.
 * Usado nos selftests para garantir que o valor padrão do front passa no backend.
 */
export function uiDefaultExpiresAtIso(days, now = Date.now()) {
  const dateStr = new Date(now + days * MS_PER_DAY).toISOString().slice(0, 10);
  return `${dateStr}T23:59:59.000Z`;
}

/**
 * Política de expires_at (pura — usada pelo service e pelo selftest).
 * - staff: obrigatório; rejeita ausente ou além do fim do dia UTC de hoje+90
 * - residente: opcional; se presente, teto fim do dia UTC de hoje+365
 *
 * Teto em granularidade de **dia UTC** para aceitar o default da UI
 * (`yyyy-mm-ddT23:59:59.000Z` de hoje+N), que em ms puros pode passar de N*24h.
 */
export function resolveExpiresAtPolicy({ staff, requestedExpiresAt, now = Date.now() }) {
  if (staff) {
    if (!requestedExpiresAt) {
      return {
        error: "Síndico/admin devem informar a validade do token (máximo 90 dias).",
      };
    }
    const ms = Date.parse(requestedExpiresAt);
    if (Number.isNaN(ms) || ms <= now) {
      return { error: "Data de expiração inválida." };
    }
    if (ms > maxExpiryEndOfUtcDayMs(now, STAFF_TOKEN_TTL_DAYS)) {
      return { error: "Validade máxima para síndico/admin é 90 dias." };
    }
    return { expiresAt: new Date(ms).toISOString() };
  }

  if (!requestedExpiresAt) return { expiresAt: null };
  const ms = Date.parse(requestedExpiresAt);
  if (Number.isNaN(ms) || ms <= now) {
    return { error: "Data de expiração inválida." };
  }
  if (ms > maxExpiryEndOfUtcDayMs(now, RESIDENT_TOKEN_MAX_TTL_DAYS)) {
    return {
      error: `Validade máxima para morador/conselheiro é ${RESIDENT_TOKEN_MAX_TTL_DAYS} dias.`,
    };
  }
  return { expiresAt: new Date(ms).toISOString() };
}

/** Default na rotação staff quando o cliente não manda nova data: agora + 90 dias. */
export function defaultStaffExpiryIso(now = Date.now()) {
  return new Date(now + STAFF_TOKEN_TTL_DAYS * MS_PER_DAY).toISOString();
}
