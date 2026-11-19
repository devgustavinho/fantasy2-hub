-- Horários: áreas comuns, janelas de mudança, convivência (barulho), dias bloqueados.

CREATE TABLE common_areas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_24h INTEGER NOT NULL DEFAULT 0,
  opens_at TEXT,
  closes_at TEXT,
  assembly_ref TEXT,
  notes TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE mudanca_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  windows_json TEXT NOT NULL,
  assembly_ref TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE mudanca_blocked_days (
  id TEXT PRIMARY KEY,
  day_date TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('national', 'fortaleza', 'custom')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_mudanca_blocked_days_date ON mudanca_blocked_days(day_date);

CREATE TABLE convivencia_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  noise_until TEXT NOT NULL,
  assembly_ref TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

-- Seed áreas
INSERT INTO common_areas (id, name, sort_order, is_24h, opens_at, closes_at) VALUES
  ('ilha-1', 'Ilha 1', 1, 0, '08:00', '22:00'),
  ('ilha-2', 'Ilha 2', 2, 0, '08:00', '22:00'),
  ('ilha-3', 'Ilha 3', 3, 0, '08:00', '22:00'),
  ('deck', 'Deck', 4, 0, '08:00', '22:00'),
  ('salao-festas', 'Salão de Festas', 5, 0, '10:00', '23:00'),
  ('sala-jogos', 'Sala de Jogos', 6, 0, '08:00', '22:00'),
  ('academia', 'Academia', 7, 1, NULL, NULL),
  ('coworking', 'Coworking', 8, 0, '08:00', '20:00'),
  ('pet-place', 'Pet Place', 9, 0, '07:00', '22:00');

-- Janelas padrão de mudança: seg–sex 08–18, sáb 08–12 (0=dom … 6=sáb)
INSERT INTO mudanca_settings (id, windows_json) VALUES (
  1,
  '[{"days":[1,2,3,4,5],"opensAt":"08:00","closesAt":"18:00"},{"days":[6],"opensAt":"08:00","closesAt":"12:00"}]'
);

INSERT INTO convivencia_settings (id, noise_until) VALUES (1, '22:00');
