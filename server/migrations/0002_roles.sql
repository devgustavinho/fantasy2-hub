-- Substitui os 2 papéis (resident/admin) por 3 (admin/sindico/morador).
-- SQLite não permite alterar um CHECK constraint existente, então a tabela é recriada.
CREATE TABLE users_new (
  id TEXT PRIMARY KEY,
  apartment_id TEXT REFERENCES apartments(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'morador' CHECK (role IN ('admin', 'sindico', 'morador')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO users_new (id, apartment_id, name, email, password_hash, role, created_at)
SELECT id, apartment_id, name, email, password_hash,
       CASE role WHEN 'resident' THEN 'morador' ELSE role END,
       created_at
FROM users;

DROP TABLE users;

ALTER TABLE users_new RENAME TO users;

CREATE UNIQUE INDEX idx_users_apartment ON users(apartment_id) WHERE apartment_id IS NOT NULL;
