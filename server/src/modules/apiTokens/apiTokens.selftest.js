/**
 * Self-test da lógica de API tokens (sem Express / sem .env).
 * Rode: node src/modules/apiTokens/apiTokens.selftest.js
 */
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import {
  API_TOKEN_PREFIX,
  DISPLAY_PREFIX_LENGTH,
  generateApiToken,
  hashApiToken,
  isApiTokenFormat,
  MAX_ACTIVE_TOKENS,
  STAFF_TOKEN_TTL_DAYS,
} from "./crypto.js";

// --- crypto ---
{
  const a = generateApiToken();
  assert.ok(a.token.startsWith(API_TOKEN_PREFIX));
  assert.equal(a.prefix, a.token.slice(0, DISPLAY_PREFIX_LENGTH));
  assert.equal(a.tokenHash, hashApiToken(a.token));
  assert.notEqual(a.tokenHash, a.token, "hash ≠ valor em claro");
  assert.ok(isApiTokenFormat(a.token));
  assert.equal(isApiTokenFormat("eyJhbGciOi"), false);

  // 32 bytes aleatórios → base64url
  const material = a.token.slice(API_TOKEN_PREFIX.length);
  assert.ok(material.length >= 43, "32 bytes em base64url");
  assert.equal(hashApiToken(a.token), createHash("sha256").update(a.token).digest("hex"));
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
  const roles = db.prepare("SELECT role FROM user_roles WHERE user_id = ?").all(userId).map((r) => r.role);
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
  if (countActive(userId) >= MAX_ACTIVE_TOKENS) {
    return { error: "limit" };
  }
  let exp = expiresAt ?? null;
  if (userIsStaff(userId)) {
    exp = new Date(Date.now() + STAFF_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  }
  const { token, prefix, tokenHash } = generateApiToken();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO api_tokens (id, user_id, name, prefix, token_hash, scopes, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, userId, name, prefix, tokenHash, JSON.stringify(["mcp"]), exp);
  return { id, token, prefix, tokenHash, expiresAt: exp };
}

function lookup(raw) {
  const row = db
    .prepare(
      `SELECT * FROM api_tokens
       WHERE token_hash = ?
         AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
    )
    .get(hashApiToken(raw));
  return row ?? null;
}

function revoke(id, userId) {
  db.prepare(
    `UPDATE api_tokens SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ? AND user_id = ? AND revoked_at IS NULL`,
  ).run(id, userId);
}

function rotate(id, userId) {
  const existing = db.prepare("SELECT * FROM api_tokens WHERE id = ? AND user_id = ?").get(id, userId);
  assert.ok(existing && !existing.revoked_at);
  const tx = db.transaction(() => {
    revoke(id, userId);
    const created = createToken(userId, existing.name);
    assert.ok(!created.error, created.error);
    return created;
  });
  return tx();
}

// --- criação + hash nunca em claro ---
{
  const created = createToken("u-morador", "Cursor");
  assert.ok(created.token.startsWith("f2h_"));
  const row = db.prepare("SELECT * FROM api_tokens WHERE id = ?").get(created.id);
  assert.equal(row.token_hash, created.tokenHash);
  assert.notEqual(row.token_hash, created.token);
  const cols = Object.values(row).join(" ");
  assert.equal(cols.includes(created.token), false, "plaintext nunca gravado");
  assert.ok(lookup(created.token));
  assert.equal(lookup(created.token + "x"), null);
}

// --- revogação ---
{
  const created = createToken("u-morador", "Revogar");
  revoke(created.id, "u-morador");
  assert.equal(lookup(created.token), null);
  const row = db.prepare("SELECT revoked_at FROM api_tokens WHERE id = ?").get(created.id);
  assert.ok(row.revoked_at);
}

// --- expiração ---
{
  const { token, prefix, tokenHash } = generateApiToken();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO api_tokens (id, user_id, name, prefix, token_hash, scopes, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, "u-morador", "Expirado", prefix, tokenHash, '["mcp"]', "2020-01-01T00:00:00.000Z");
  assert.equal(lookup(token), null, "token vencido não autentica");
}

// --- rotação ---
{
  const original = createToken("u-morador", "Rotacionar");
  const next = rotate(original.id, "u-morador");
  assert.notEqual(next.token, original.token);
  assert.equal(lookup(original.token), null, "antigo revogado");
  assert.ok(lookup(next.token), "novo válido");
}

// --- limite de 5 ativos ---
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

// --- staff: 90 dias obrigatórios + 2FA na criação ---
{
  assert.equal(createToken("u-staff-no2fa", "Sem2FA").error, "totp_required");

  const staff = createToken("u-staff", "MCP staff", { expiresAt: null });
  assert.ok(staff.expiresAt);
  const ms = Date.parse(staff.expiresAt) - Date.now();
  const days = ms / (24 * 60 * 60 * 1000);
  assert.ok(days > STAFF_TOKEN_TTL_DAYS - 0.1 && days < STAFF_TOKEN_TTL_DAYS + 0.1, `~90d got ${days}`);

  // morador pode omitir expiração
  const morador = createToken("u-morador", "Sem expiry");
  assert.equal(morador.expiresAt, null);
}

// material aleatório distinto
{
  const set = new Set();
  for (let i = 0; i < 20; i++) set.add(generateApiToken().token);
  assert.equal(set.size, 20);
  // sanity: randomBytes ainda disponível (formato)
  assert.equal(randomBytes(32).length, 32);
}

console.log("apiTokens selftest ok");
