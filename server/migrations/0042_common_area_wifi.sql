-- Wi‑Fi por área comum: SSID/senha gerenciados pelo staff; moradores conectam via app.
-- Validação de wifi_security (WPA|WEP|nopass) fica na API.
ALTER TABLE common_areas ADD COLUMN wifi_ssid TEXT;
ALTER TABLE common_areas ADD COLUMN wifi_password TEXT;
ALTER TABLE common_areas ADD COLUMN wifi_security TEXT NOT NULL DEFAULT 'WPA';
