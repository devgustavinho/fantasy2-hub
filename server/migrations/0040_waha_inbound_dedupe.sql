-- Idempotência do webhook WAHA: message + message.any disparam o mesmo inbound
-- duas vezes; claim por message_id evita reply/cota duplicados.
CREATE TABLE waha_inbound_claims (
  message_id TEXT PRIMARY KEY,
  claimed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  action TEXT
);

-- Cota RAG também amarra ao message_id (UNIQUE) pra não cobrar 2× no mesmo inbound.
ALTER TABLE waha_ask_log ADD COLUMN message_id TEXT;
CREATE UNIQUE INDEX idx_waha_ask_log_message_id ON waha_ask_log(message_id)
  WHERE message_id IS NOT NULL;
