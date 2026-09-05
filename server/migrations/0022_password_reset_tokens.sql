-- Token de redefinição de senha (uso único, 1h de validade) — substitui a senha temporária:
-- em vez do admin/síndico gerar uma senha e repassar por fora, a pessoa define a própria senha
-- a partir do link do e-mail. Só o hash (sha256) do token fica salvo (server/src/modules/auth/
-- passwordReset.js) — o token puro nunca é persistido, só existe no link enviado por e-mail.
CREATE TABLE password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_password_reset_tokens_user ON password_reset_tokens(user_id);
