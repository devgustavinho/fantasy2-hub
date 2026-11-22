-- Negócios: modos de cumprimento + slug de share escolhido pelo vendedor (/n/<slug>).
-- Default físico do condomínio: porta / retirada / portaria (online fica opcional).
ALTER TABLE condo_services ADD COLUMN fulfillment_modes TEXT NOT NULL DEFAULT '["door","pickup","lobby"]';
ALTER TABLE condo_services ADD COLUMN slug TEXT;
CREATE UNIQUE INDEX idx_condo_services_slug ON condo_services(slug COLLATE NOCASE) WHERE slug IS NOT NULL;

-- Tag canônica "Comida" (convenção v1: filtro Comida = tem esta tag).
INSERT INTO tags (id, name)
SELECT 'a1000000-0000-4000-8000-000000000001', 'Comida'
WHERE NOT EXISTS (SELECT 1 FROM tags WHERE name = 'Comida' COLLATE NOCASE);
