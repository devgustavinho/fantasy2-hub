-- Motivo opcional informado pelo admin ao recusar um cadastro (vai no e-mail de retorno).
ALTER TABLE users ADD COLUMN rejection_reason TEXT;
