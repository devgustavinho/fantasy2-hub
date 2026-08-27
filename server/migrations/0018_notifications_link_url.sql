-- Notificações sem pauta (ex. aviso de aprovação pendente pro admin) não tinham like nenhum
-- destino próprio — o front sempre montava `/topics/${topicId}`, que virava `/topics/null`.
-- Esse campo guarda o destino explícito; quando ausente, o front cai no fallback de sempre.
ALTER TABLE notifications ADD COLUMN link_url TEXT;
