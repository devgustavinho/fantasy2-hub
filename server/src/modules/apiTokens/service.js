import { randomUUID } from "node:crypto";
import { sqlite } from "../../db/client.js";
import { userIsStaff } from "../../auth/roles.js";
import {
  generateApiToken,
  hashApiToken,
  isApiTokenFormat,
  MAX_ACTIVE_TOKENS,
  STAFF_TOKEN_TTL_DAYS,
} from "./crypto.js";

const DEFAULT_SCOPES = ["mcp"];

const countActive = sqlite.prepare(`
  SELECT COUNT(*) AS c FROM api_tokens
  WHERE user_id = ?
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
`);

const insertToken = sqlite.prepare(`
  INSERT INTO api_tokens (id, user_id, name, prefix, token_hash, scopes, expires_at)
  VALUES (@id, @user_id, @name, @prefix, @token_hash, @scopes, @expires_at)
`);

const listByUser = sqlite.prepare(`
  SELECT id, name, prefix, scopes, created_at, last_used_at, expires_at, revoked_at
  FROM api_tokens
  WHERE user_id = ?
  ORDER BY created_at DESC
`);

const getOwned = sqlite.prepare(`
  SELECT id, user_id, name, prefix, scopes, created_at, last_used_at, expires_at, revoked_at
  FROM api_tokens
  WHERE id = ? AND user_id = ?
`);

const revokeStmt = sqlite.prepare(`
  UPDATE api_tokens
  SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = ? AND user_id = ? AND revoked_at IS NULL
`);

const findValidByHash = sqlite.prepare(`
  SELECT id, user_id, scopes, last_used_at, expires_at, revoked_at
  FROM api_tokens
  WHERE token_hash = ?
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
`);

const touchLastUsed = sqlite.prepare(`
  UPDATE api_tokens
  SET last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = ?
`);

function parseScopes(raw) {
  if (!raw) return [...DEFAULT_SCOPES];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [...DEFAULT_SCOPES];
  } catch {
    return [...DEFAULT_SCOPES];
  }
}

function toPublicToken(row) {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: parseScopes(row.scopes),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at ?? null,
    expiresAt: row.expires_at ?? null,
    revokedAt: row.revoked_at ?? null,
    active:
      !row.revoked_at &&
      (!row.expires_at || Date.parse(row.expires_at) > Date.now()),
  };
}

function resolveExpiresAt(user, requestedExpiresAt) {
  if (userIsStaff(user)) {
    const forced = new Date(Date.now() + STAFF_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    return forced;
  }
  if (!requestedExpiresAt) return null;
  const ms = Date.parse(requestedExpiresAt);
  if (Number.isNaN(ms) || ms <= Date.now()) {
    return { error: "Data de expiração inválida." };
  }
  return new Date(ms).toISOString();
}

function assertCanCreate(user) {
  if (userIsStaff(user) && !user.totp_enabled) {
    return {
      error: {
        status: 403,
        code: "totp_required",
        message: "Configure a autenticação em duas etapas para gerar tokens de API.",
      },
    };
  }
  const active = countActive.get(user.id).c;
  if (active >= MAX_ACTIVE_TOKENS) {
    return {
      error: {
        status: 400,
        message: `Limite de ${MAX_ACTIVE_TOKENS} tokens ativos por usuário. Revogue um antes de criar outro.`,
      },
    };
  }
  return {};
}

/**
 * Cria um token. O valor em claro (`token`) só existe no retorno — nunca no banco.
 */
export function createApiToken({ user, name, expiresAt: requestedExpiresAt }) {
  const gate = assertCanCreate(user);
  if (gate.error) return gate;

  const expiresAt = resolveExpiresAt(user, requestedExpiresAt);
  if (expiresAt && typeof expiresAt === "object" && expiresAt.error) {
    return { error: { status: 400, message: expiresAt.error } };
  }

  const { token, prefix, tokenHash } = generateApiToken();
  const id = randomUUID();
  insertToken.run({
    id,
    user_id: user.id,
    name: name.trim(),
    prefix,
    token_hash: tokenHash,
    scopes: JSON.stringify(DEFAULT_SCOPES),
    expires_at: expiresAt,
  });

  const row = getOwned.get(id, user.id);
  return { token: toPublicToken(row), value: token };
}

export function listApiTokens(userId) {
  return listByUser.all(userId).map(toPublicToken);
}

export function revokeApiToken({ userId, tokenId }) {
  const row = getOwned.get(tokenId, userId);
  if (!row) return { error: { status: 404, message: "Token não encontrado." } };
  if (row.revoked_at) return { error: { status: 400, message: "Token já está revogado." } };
  revokeStmt.run(tokenId, userId);
  return { token: toPublicToken(getOwned.get(tokenId, userId)) };
}

/**
 * Revoga o token atual e cria um novo atomicamente (mesmo nome / política de expiração).
 */
export function rotateApiToken({ user, tokenId }) {
  const existing = getOwned.get(tokenId, user.id);
  if (!existing) return { error: { status: 404, message: "Token não encontrado." } };
  if (existing.revoked_at) {
    return { error: { status: 400, message: "Não é possível rotacionar um token já revogado." } };
  }

  // 2FA na criação/rotação para síndico/admin; o limite de 5 é tratado na TX (revoga + cria).
  if (userIsStaff(user) && !user.totp_enabled) {
    return {
      error: {
        status: 403,
        code: "totp_required",
        message: "Configure a autenticação em duas etapas para gerar tokens de API.",
      },
    };
  }

  const expiresAt = resolveExpiresAt(user, null);
  // Staff sempre 90 dias a partir de agora; morador: herda a data absoluta restante se houver.
  let nextExpires = expiresAt && typeof expiresAt === "string" ? expiresAt : null;
  if (!userIsStaff(user) && existing.expires_at) {
    nextExpires = existing.expires_at;
  }

  const tx = sqlite.transaction(() => {
    revokeStmt.run(tokenId, user.id);
    const active = countActive.get(user.id).c;
    if (active >= MAX_ACTIVE_TOKENS) {
      throw Object.assign(new Error("limit"), { code: "token_limit" });
    }
    const { token, prefix, tokenHash } = generateApiToken();
    const id = randomUUID();
    insertToken.run({
      id,
      user_id: user.id,
      name: existing.name,
      prefix,
      token_hash: tokenHash,
      scopes: existing.scopes || JSON.stringify(DEFAULT_SCOPES),
      expires_at: nextExpires,
    });
    return { id, value: token };
  });

  try {
    const { id, value } = tx();
    return { token: toPublicToken(getOwned.get(id, user.id)), value, revokedId: tokenId };
  } catch (err) {
    if (err?.code === "token_limit") {
      return {
        error: {
          status: 400,
          message: `Limite de ${MAX_ACTIVE_TOKENS} tokens ativos por usuário.`,
        },
      };
    }
    throw err;
  }
}

/** Resolve Bearer f2h_ → registro válido (não revogado / não vencido). */
export function lookupValidApiToken(rawToken) {
  if (!isApiTokenFormat(rawToken)) return null;
  return findValidByHash.get(hashApiToken(rawToken)) ?? null;
}

/** Atualiza last_used_at no máximo 1× por minuto. */
export function touchApiTokenLastUsed(row) {
  if (!row?.id) return;
  if (row.last_used_at) {
    const last = Date.parse(row.last_used_at);
    if (!Number.isNaN(last) && Date.now() - last < 60_000) return;
  }
  touchLastUsed.run(row.id);
}

export function parseTokenScopes(row) {
  return parseScopes(row?.scopes);
}

// Exportado para selftests / inspeção.
export const _internals = {
  hashApiToken,
  countActive,
  findValidByHash,
  resolveExpiresAt,
  STAFF_TOKEN_TTL_DAYS,
  MAX_ACTIVE_TOKENS,
};
