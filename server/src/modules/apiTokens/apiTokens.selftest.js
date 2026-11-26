/**
 * Self-test de API tokens + escopo do JWT interno (sem Express).
 * Rode: node src/modules/apiTokens/apiTokens.selftest.js
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  API_TOKEN_PREFIX,
  DISPLAY_PREFIX_LENGTH,
  generateApiToken,
  hashApiToken,
  isApiTokenFormat,
  maxExpiryEndOfUtcDayMs,
  RESIDENT_TOKEN_MAX_TTL_DAYS,
  resolveExpiresAtPolicy,
  STAFF_TOKEN_TTL_DAYS,
  uiDefaultExpiresAtIso,
} from "./crypto.js";
import { isLoopbackRemoteAddress, resolveInternalJwtAccess } from "../../auth/loopback.js";
import { permissionTier } from "../mcp/roles.js";
import { registerToolsForUser } from "../mcp/tools.js";

const MS_DAY = 24 * 60 * 60 * 1000;

// --- crypto / hash ---
{
  const a = generateApiToken();
  assert.ok(a.token.startsWith(API_TOKEN_PREFIX));
  assert.equal(a.prefix, a.token.slice(0, DISPLAY_PREFIX_LENGTH));
  assert.equal(a.tokenHash, createHash("sha256").update(a.token).digest("hex"));
  assert.notEqual(a.tokenHash, a.token);
  assert.ok(isApiTokenFormat(a.token));
  assert.equal(isApiTokenFormat("eyJhbGciOi"), false);
}

// --- default da UI (90 / 365) deve passar no teto por dia UTC ---
{
  const now = Date.UTC(2026, 0, 15, 14, 30, 0); // meio do dia → UI default ultrapassa N*24h em ms
  const ui90 = uiDefaultExpiresAtIso(STAFF_TOKEN_TTL_DAYS, now);
  const ui365 = uiDefaultExpiresAtIso(RESIDENT_TOKEN_MAX_TTL_DAYS, now);
  assert.ok(Date.parse(ui90) - now > STAFF_TOKEN_TTL_DAYS * MS_DAY, "precondição do bug");
  assert.equal(resolveExpiresAtPolicy({ staff: true, requestedExpiresAt: ui90, now }).error, undefined);
  assert.ok(resolveExpiresAtPolicy({ staff: true, requestedExpiresAt: ui90, now }).expiresAt);
  assert.equal(
    resolveExpiresAtPolicy({ staff: false, requestedExpiresAt: ui365, now }).error,
    undefined,
  );

  // um dia além do teto (fim do dia de hoje+N+1) ainda rejeita
  const overStaff = new Date(maxExpiryEndOfUtcDayMs(now, STAFF_TOKEN_TTL_DAYS) + 1).toISOString();
  assert.ok(resolveExpiresAtPolicy({ staff: true, requestedExpiresAt: overStaff, now }).error);
  assert.ok(resolveExpiresAtPolicy({ staff: true, requestedExpiresAt: null, now }).error);
}

// --- JWT interno só em loopback ---
{
  assert.equal(isLoopbackRemoteAddress("127.0.0.1"), true);
  assert.equal(isLoopbackRemoteAddress("::1"), true);
  assert.equal(isLoopbackRemoteAddress("::ffff:127.0.0.1"), true);
  assert.equal(isLoopbackRemoteAddress("8.8.8.8"), false);
  assert.equal(isLoopbackRemoteAddress("10.0.0.1"), false);
  assert.equal(resolveInternalJwtAccess("127.0.0.1").ok, true);
  const denied = resolveInternalJwtAccess("203.0.113.10");
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "internal_jwt_loopback_only");
}

// --- filtro de tools por cargo ---
{
  assert.equal(permissionTier({ role: "morador", roles: ["morador"] }), "resident");
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
    registerToolsForUser({ registerTool(name) { names.push(name); } }, api, user);
    return names;
  }
  const resident = collect({ role: "morador", roles: ["morador"], email: "m@x" });
  assert.ok(!resident.includes("list_users"));
  assert.ok(!resident.includes("list_audit_log"));
  const staff = collect({ role: "sindico", roles: ["sindico"], email: "s@x" });
  assert.ok(staff.includes("list_users"));
  assert.ok(!staff.includes("list_audit_log"));
  const admin = collect({ role: "admin", roles: ["admin"], email: "a@x" });
  assert.ok(admin.includes("list_audit_log"));
}

// --- service.js real (env + :memory:) ---
Object.assign(process.env, {
  NODE_ENV: "development",
  DATABASE_PATH: ":memory:",
  JWT_SECRET: "selftest-jwt-secret-32chars!!",
  CORS_ORIGIN: "http://localhost:5173",
  VAPID_PUBLIC_KEY: "vapid-public-selftest",
  VAPID_PRIVATE_KEY: "vapid-private-selftest",
  VAPID_SUBJECT: "mailto:selftest@example.com",
  R2_ACCOUNT_ID: "acct",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET_NAME: "bucket",
  R2_PUBLIC_URL: "https://example.com",
  RESEND_API_KEY: "re_test",
  EMAIL_FROM: "Fantasy 2 <noreply@example.com>",
});

const { sqlite } = await import("../../db/client.js");
sqlite.exec(`
  CREATE TABLE apartments (
    id TEXT PRIMARY KEY,
    tower TEXT,
    code TEXT
  );
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    apartment_id TEXT REFERENCES apartments(id),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL,
    approval_status TEXT NOT NULL DEFAULT 'approved',
    whatsapp TEXT,
    whatsapp_visible INTEGER NOT NULL DEFAULT 0,
    household_role TEXT,
    totp_enabled INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE user_roles (
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    PRIMARY KEY (user_id, role)
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
  CREATE TABLE audit_log (
    id TEXT PRIMARY KEY,
    actor_user_id TEXT,
    actor_name TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`);

const insertUser = sqlite.prepare(`
  INSERT INTO users (id, name, email, role, approval_status, totp_enabled)
  VALUES (?, ?, ?, ?, 'approved', ?)
`);
const insertRole = sqlite.prepare("INSERT INTO user_roles (user_id, role) VALUES (?, ?)");
insertUser.run("u-morador", "Morador", "m@example.com", "morador", 0);
insertRole.run("u-morador", "morador");
insertUser.run("u-staff", "Sindico", "s@example.com", "sindico", 1);
insertRole.run("u-staff", "sindico");
insertUser.run("u-staff-no2fa", "Admin", "a@example.com", "admin", 0);
insertRole.run("u-staff-no2fa", "admin");

const {
  authenticateApiToken,
  createApiToken,
  revokeApiToken,
  rotateApiToken,
} = await import("./service.js");

function staffUser(overrides = {}) {
  return {
    id: "u-staff",
    name: "Sindico",
    role: "sindico",
    roles: ["sindico"],
    totp_enabled: 1,
    ...overrides,
  };
}

function moradorUser() {
  return {
    id: "u-morador",
    name: "Morador",
    role: "morador",
    roles: ["morador"],
    totp_enabled: 0,
  };
}

// criação + hash nunca em claro
{
  const created = createApiToken({ user: moradorUser(), name: "Cursor" });
  assert.ok(created.value.startsWith("f2h_"));
  const row = sqlite.prepare("SELECT * FROM api_tokens WHERE id = ?").get(created.token.id);
  assert.equal(row.token_hash, hashApiToken(created.value));
  assert.equal(Object.values(row).join(" ").includes(created.value), false);
  assert.equal(authenticateApiToken(created.value).ok, true);
}

// 2FA na criação (staff)
{
  const r = createApiToken({
    user: staffUser({ id: "u-staff-no2fa", totp_enabled: 0, roles: ["admin"], role: "admin" }),
    name: "x",
    expiresAt: uiDefaultExpiresAtIso(30),
  });
  assert.equal(r.error?.code, "totp_required");
}

// UI default 90d staff via service real
{
  const r = createApiToken({
    user: staffUser(),
    name: "UI90",
    expiresAt: uiDefaultExpiresAtIso(STAFF_TOKEN_TTL_DAYS),
  });
  assert.ok(!r.error, r.error?.message);
  assert.ok(r.token.expiresAt);
}

// 2FA na rotação (staff sem totp)
{
  const seeded = createApiToken({
    user: staffUser(),
    name: "rot",
    expiresAt: uiDefaultExpiresAtIso(30),
  });
  assert.ok(seeded.token?.id);
  // simula staff sem 2FA tentando rotacionar o próprio token (mesmo id de user com totp off)
  sqlite.prepare("UPDATE users SET totp_enabled = 0 WHERE id = ?").run("u-staff");
  const rotated = rotateApiToken({
    user: staffUser({ totp_enabled: 0 }),
    tokenId: seeded.token.id,
  });
  assert.equal(rotated.error?.code, "totp_required");
  sqlite.prepare("UPDATE users SET totp_enabled = 1 WHERE id = ?").run("u-staff");
}

// rotação ok + antigo revogado
{
  const original = createApiToken({
    user: staffUser(),
    name: "spin",
    expiresAt: uiDefaultExpiresAtIso(45),
  });
  const next = rotateApiToken({ user: staffUser(), tokenId: original.token.id });
  assert.ok(!next.error, next.error?.message);
  assert.notEqual(next.value, original.value);
  assert.equal(authenticateApiToken(original.value).reason, "revoked");
  assert.equal(authenticateApiToken(next.value).ok, true);
}

// expirado / revogado
{
  const live = createApiToken({ user: moradorUser(), name: "bye" });
  revokeApiToken({ userId: "u-morador", tokenId: live.token.id });
  assert.equal(authenticateApiToken(live.value).reason, "revoked");

  const { token, prefix, tokenHash } = generateApiToken();
  sqlite
    .prepare(
      `INSERT INTO api_tokens (id, user_id, name, prefix, token_hash, scopes, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run("expired-1", "u-morador", "old", prefix, tokenHash, '["mcp"]', "2020-01-01T00:00:00.000Z");
  assert.equal(authenticateApiToken(token).reason, "expired");
}

console.log("apiTokens selftest ok");
