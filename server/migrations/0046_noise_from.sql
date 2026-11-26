-- Início do horário de barulho permitido (antes = silêncio). Default 07:00.

ALTER TABLE convivencia_settings ADD COLUMN noise_from TEXT NOT NULL DEFAULT '07:00';
