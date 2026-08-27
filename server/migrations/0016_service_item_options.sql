-- Configurador de item: cada item pode ter grupos de opção (ex. "Toppings", "Cobertura",
-- "Sabor"), cada grupo com um jeito de escolher (single = 1 opção, multi = até N) e suas
-- opções, cada uma podendo somar/subtrair do preço do item.
CREATE TABLE condo_service_item_option_groups (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES condo_service_items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  selection_type TEXT NOT NULL CHECK (selection_type IN ('single', 'multi')),
  max_selections INTEGER,
  required INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_option_groups_item ON condo_service_item_option_groups(item_id);

CREATE TABLE condo_service_item_options (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES condo_service_item_option_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_delta_cents INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_options_group ON condo_service_item_options(group_id);
