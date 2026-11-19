-- Código curto único pra compartilhar a pauta (/t/<code>, máx. 6 A-Za-z0-9).
-- Backfill dos existentes roda no boot da API (ensureTopicShareCodes).
ALTER TABLE topics ADD COLUMN share_code TEXT;
CREATE UNIQUE INDEX idx_topics_share_code ON topics(share_code) WHERE share_code IS NOT NULL;
