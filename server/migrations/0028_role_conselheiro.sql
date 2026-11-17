-- Cargo "conselheiro": tag de reconhecimento no condomínio, sem poderes de síndico/admin.
-- SQLite não permite alterar CHECK existente — recria a tabela users com o novo valor.
CREATE TABLE users_new (
  id TEXT PRIMARY KEY,
  apartment_id TEXT REFERENCES apartments(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'morador' CHECK (role IN ('admin', 'sindico', 'conselheiro', 'morador')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  totp_secret TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  approval_status TEXT NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  whatsapp TEXT,
  whatsapp_visible INTEGER NOT NULL DEFAULT 0,
  household_role TEXT NOT NULL DEFAULT 'owner'
    CHECK (household_role IN ('owner', 'family')),
  invited_by TEXT REFERENCES users_new(id),
  last_login_at TEXT,
  rejection_reason TEXT
);

INSERT INTO users_new (
  id, apartment_id, name, email, password_hash, role, created_at,
  totp_secret, totp_enabled, approval_status, whatsapp, whatsapp_visible,
  household_role, invited_by, last_login_at, rejection_reason
)
SELECT
  id, apartment_id, name, email, password_hash, role, created_at,
  totp_secret, totp_enabled, approval_status, whatsapp, whatsapp_visible,
  household_role, invited_by, last_login_at, rejection_reason
FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

CREATE UNIQUE INDEX idx_users_apartment_household ON users(apartment_id, household_role)
  WHERE apartment_id IS NOT NULL;
