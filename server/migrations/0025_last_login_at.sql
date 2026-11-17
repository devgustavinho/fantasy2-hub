-- Marca o último login bem-sucedido (sessão JWT emitida). Usado na home e no painel
-- admin para contar quantas pessoas entraram nas últimas 24 horas.
ALTER TABLE users ADD COLUMN last_login_at TEXT;
