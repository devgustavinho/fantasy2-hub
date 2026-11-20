-- Múltiplos cargos por usuário. users.role passa a ser o modo/visão ativa
-- (deve estar em user_roles). Backfill a partir do cargo único atual.
CREATE TABLE user_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'sindico', 'conselheiro', 'morador')),
  PRIMARY KEY (user_id, role)
);

INSERT INTO user_roles (user_id, role)
SELECT id, role FROM users;

CREATE INDEX idx_user_roles_role ON user_roles(role);
