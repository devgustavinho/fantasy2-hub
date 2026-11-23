-- Visitas ao hub (inclui anônimos). Deduplica por visitor_id persistido no cliente.
-- Substitui a métrica "acessos 24h" que antes usava só users.last_login_at (login JWT).
CREATE TABLE hub_visits (
  visitor_id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE INDEX idx_hub_visits_last_seen_at ON hub_visits(last_seen_at);
CREATE INDEX idx_hub_visits_user_id ON hub_visits(user_id);
