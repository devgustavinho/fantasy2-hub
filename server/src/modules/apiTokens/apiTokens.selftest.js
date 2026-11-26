/**
 * Self-test da lógica de API tokens + filtro MCP por cargo (sem Express / sem .env).
 * Rode: node src/modules/apiTokens/apiTokens.selftest.js
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import {
  API_TOKEN_PREFIX,
  DISPLAY_PREFIX_LENGTH,
  generateApiToken,
  hashApiToken,
  isApiTokenFormat,
  MAX_ACTIVE_TOKENS,
  RESIDENT_TOKEN_MAX_TTL_DAYS,
  resolveExpiresAtPolicy,
  STAFF_TOKEN_TTL_DAYS,
} from "./crypto.js";
import { permissionTier } from "../mcp/roles.js";
import { registerToolsForUser } from "../mcp/tools.js";

const MS_DAY = 24 * 60 * 60 * 1000;

// --- crypto / hash / verificação ---
{
  const a = generateApiToken();
  assert.ok(a.token.startsWith(API_TOKEN_PREFIX));
  assert.equal(a.prefix, a.token.slice(0, DISPLAY_PREFIX_LENGTH));
  assert.equal(a.tokenHash, hashApiToken(a.token));
  assert.equal(a.tokenHash, createHash("sha256").update(a.token).digest("hex"));
  assert.notEqual(a.tokenHash, a.token, "hash ≠ valor em claro");
  assert.ok(isApiTokenFormat(a.token));
  assert.equal(isApiTokenFormat("eyJhbGciOi"), false);
  assert.ok(a.token.slice(API_TOKEN_PREFIX.length).length >= 43, "32 bytes base64url");
}

// --- política de validade (pura) ---
{
  const now = Date.UTC(2026, 0, 1);
  assert.equal(
    resolveExpiresAtPolicy({ staff: true, requestedExpiresAt: null, now }).error?.includes("90"),
    true,
  );
  assert.ok(
    resolveExpiresAtPolicy({
      staff: true,
      requestedExpiresAt: new Date(now + 91 * MS_DAY).toISOString(),
      now,
    }).error,
  );
  const ok90 = resolveExpiresAtPolicy({
    staff: true,
    requestedExpiresAt: new Date(now + 90 * MS_DAY).toISOString(),
    now,
  });
  assert.ok(ok90.expiresAt);
  assert.equal(ok90.error, undefined);

  assert.equal(
    resolveExpiresAtPolicy({ staff: false, requestedExpiresAt: null, now }).expiresAt,
    null,
  );
  assert.ok(
    resolveExpiresAtPolicy({
      staff: false,
      requestedExpiresAt: new Date(now + (RESIDENT_TOKEN_MAX_TTL_DAYS + 1) * MS_DAY).toISOString(),
      now,
    }).error,
  );
  const okRes = resolveExpiresAtPolicy({
    staff: false,
    requestedExpiresAt: new Date(now + 30 * MS_DAY).toISOString(),
    now,
  });
  assert.ok(okRes.expiresAt);
}

const db = new Database(":memory:");
db.pragma("foreign_keys = ON");
db.exec(`
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    totp_enabled INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE user_roles (
    user_id TEXT NOT NULL,
    role TEXT NOT NULL
  );
  CREATE TABLE api_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    prefix TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    scopes TEXT NOT NULL DEFAULT '["mcp"]',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_used_at TEXT,
    expires_at TEXT,
    revoked_at TEXT
  );
  CREATE UNIQUE INDEX idx_api_tokens_hash ON api_tokens(token_hash);
`);

const insertUser = db.prepare(
  "INSERT INTO users (id, name, role, totp_enabled) VALUES (?, ?, ?, ?)",
);
const insertRole = db.prepare("INSERT INTO user_roles (user_id, role) VALUES (?, ?)");
insertUser.run("u-morador", "Morador", "morador", 0);
insertRole.run("u-morador", "morador");
insertUser.run("u-staff", "Síndico", "sindico", 1);
insertRole.run("u-staff", "sindico");
insertUser.run("u-staff-no2fa", "Admin", "admin", 0);
insertRole.run("u-staff-no2fa", "admin");

function userIsStaff(userId) {
  const roles = db
    .prepare("SELECT role FROM user_roles WHERE user_id = ?")
    .all(userId)
    .map((r) => r.role);
  return roles.includes("admin") || roles.includes("sindico");
}

function countActive(userId) {
  return db
    .prepare(
      `SELECT COUNT(*) AS c FROM api_tokens
       WHERE user_id = ?
         AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
    )
    .get(userId).c;
}

function createToken(userId, name, { expiresAt } = {}) {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (userIsStaff(userId) && !user.totp_enabled) {
    return { error: "totp_required" };
  }
  if (countActive(userId) >= MAX_ACTIVE_TOKENS) return { error: "limit" };

  const resolved = resolveExpiresAtPolicy({
    staff: userIsStaff(userId),
    requestedExpiresAt: expiresAt ?? null,
  });
  if (resolved.error) return { error: resolved.error };

  const { token, prefix, tokenHash } = generateApiToken();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO api_tokens (id, user_id, name, prefix, token_hash, scopes, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, userId, name, prefix, tokenHash, JSON.stringify(["mcp"]), resolved.expiresAt);
  return { id, token, prefix, tokenHash, expiresAt: resolved.expiresAt };
}

function authenticate(raw) {
  if (!isApiTokenFormat(raw)) return { ok: false, reason: "invalid" };
  const row = db.prepare("SELECT * FROM api_tokens WHERE token_hash = ?").get(hashApiToken(raw));
  if (!row) return { ok: false, reason: "invalid" };
  if (row.revoked_at) return { ok: false, reason: "revoked" };
  if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, row };
}

function revoke(id, userId) {
  db.prepare(
    `UPDATE api_tokens SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ? AND user_id = ? AND revoked_at IS NULL`,
  ).run(id, userId);
}

function rotate(id, userId, expiresAt) {
  const existing = db.prepare("SELECT * FROM api_tokens WHERE id = ? AND user_id = ?").get(id, userId);
  assert.ok(existing && !existing.revoked_at);
  return db.transaction(() => {
    revoke(id, userId);
    const created = createToken(userId, existing.name, {
      expiresAt:
        expiresAt ??
        (userIsStaff(userId)
          ? new Date(Date.now() + STAFF_TOKEN_TTL_DAYS * MS_DAY).toISOString()
          : existing.expires_at),
    });
    assert.ok(!created.error, created.error);
    return created;
  })();
}

// --- criação + hash nunca em claro ---
{
  const created = createToken("u-morador", "Cursor");
  assert.ok(created.token.startsWith("f2h_"));
  const row = db.prepare("SELECT * FROM api_tokens WHERE id = ?").get(created.id);
  assert.equal(row.token_hash, created.tokenHash);
  assert.equal(Object.values(row).join(" ").includes(created.token), false);
  assert.equal(authenticate(created.token).ok, true);
  assert.equal(authenticate(created.token + "x").reason, "invalid");
}

// --- 2FA na criação (staff/admin) ---
{
  assert.equal(createToken("u-staff-no2fa", "Sem2FA", {
    expiresAt: new Date(Date.now() + 30 * MS_DAY).toISOString(),
  }).error, "totp_required");
}

// --- teto 90d staff/admin ---
{
  assert.ok(
    createToken("u-staff", "SemExpiry").error,
    "staff sem validade rejeitado",
  );
  assert.ok(
    createToken("u-staff", "Over90", {
      expiresAt: new Date(Date.now() + 91 * MS_DAY).toISOString(),
    }).error,
  );
  const staff = createToken("u-staff", "MCP staff", {
    expiresAt: new Date(Date.now() + 60 * MS_DAY).toISOString(),
  });
  assert.ok(staff.expiresAt);
  assert.ok(!staff.error);
}

// --- morador: opcional com teto ---
{
  const open = createToken("u-morador", "Sem expiry");
  assert.equal(open.expiresAt, null);
  assert.ok(
    createToken("u-morador", "OverCap", {
      expiresAt: new Date(Date.now() + (RESIDENT_TOKEN_MAX_TTL_DAYS + 5) * MS_DAY).toISOString(),
    }).error,
  );
}

// --- revogado / expirado → 401 reason ---
{
  const live = createToken("u-morador", "Revogar");
  revoke(live.id, "u-morador");
  assert.equal(authenticate(live.token).reason, "revoked");

  const { token, prefix, tokenHash } = generateApiToken();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO api_tokens (id, user_id, name, prefix, token_hash, scopes, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, "u-morador", "Expirado", prefix, tokenHash, '["mcp"]', "2020-01-01T00:00:00.000Z");
  assert.equal(authenticate(token).reason, "expired");
}

// --- rotação ---
{
  const original = createToken("u-morador", "Rotacionar");
  const next = rotate(original.id, "u-morador");
  assert.notEqual(next.token, original.token);
  assert.equal(authenticate(original.token).reason, "revoked");
  assert.equal(authenticate(next.token).ok, true);
}

// --- limite de 5 ---
{
  const uid = "u-limit";
  insertUser.run(uid, "Limiter", "morador", 0);
  insertRole.run(uid, "morador");
  const tokens = [];
  for (let i = 0; i < MAX_ACTIVE_TOKENS; i++) {
    const c = createToken(uid, `t${i}`);
    assert.ok(!c.error, c.error);
    tokens.push(c);
  }
  assert.equal(createToken(uid, "overflow").error, "limit");
  revoke(tokens[0].id, uid);
  assert.ok(!createToken(uid, "after-revoke").error);
}

// --- filtro de tools por cargo ---
{
  assert.equal(permissionTier({ role: "morador", roles: ["morador"] }), "resident");
  assert.equal(permissionTier({ role: "conselheiro", roles: ["conselheiro"] }), "resident");
  assert.equal(permissionTier({ role: "sindico", roles: ["sindico"] }), "staff");
  assert.equal(permissionTier({ role: "admin", roles: ["admin"] }), "admin");

  const api = {
    get: async () => ({}),
    post: async () => ({}),
    patch: async () => ({}),
    delete: async () => ({}),
  };
  function collect(user) {
    const names = [];
    const server = {
      registerTool(name) {
        names.push(name);
      },
    };
    registerToolsForUser(server, api, user);
    return names;
  }

  const residentTools = collect({
    role: "morador",
    roles: ["morador"],
    email: "m@x",
    approvalStatus: "approved",
  });
  assert.ok(residentTools.includes("whoami"));
  assert.ok(!residentTools.includes("list_users"), "morador sem tools staff");
  assert.ok(!residentTools.includes("list_audit_log"), "morador sem tools admin");

  const staffTools = collect({
    role: "sindico",
    roles: ["sindico"],
    email: "s@x",
    approvalStatus: "approved",
  });
  assert.ok(staffTools.includes("list_users"));
  assert.ok(!staffTools.includes("list_audit_log"), "síndico sem tools admin");

  const adminTools = collect({
    role: "admin",
    roles: ["admin"],
    email: "a@x",
    approvalStatus: "approved",
  });
  assert.ok(adminTools.includes("list_audit_log"));
  assert.ok(adminTools.length > staffTools.length);
}

console.log("apiTokens selftest ok");
