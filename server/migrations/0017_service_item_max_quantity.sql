-- NULL = item fixo em 1 unidade por pedido (comportamento atual). Um número > 1 permite ao
-- cliente escolher a quantidade (1 até esse valor) no montador do item.
ALTER TABLE condo_service_items ADD COLUMN max_quantity INTEGER;
