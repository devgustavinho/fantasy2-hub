-- Cota de perguntas RAG via WhatsApp (janela móvel de 24h), chaveada pelo número.
CREATE TABLE waha_ask_log (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  asked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_waha_ask_log_phone_time ON waha_ask_log(phone, asked_at);
