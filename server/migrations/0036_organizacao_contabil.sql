-- Organização contábil: balancetes mensais + pareceres do conselho fiscal.

CREATE TABLE balancetes (
  id TEXT PRIMARY KEY,
  reference_month TEXT NOT NULL,
  title TEXT NOT NULL,
  pdf_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'em_analise'
    CHECK (status IN ('em_analise', 'aprovado', 'aprovado_ressalvas', 'reprovado')),
  published_by TEXT NOT NULL REFERENCES users(id),
  published_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (reference_month)
);
CREATE INDEX idx_balancetes_month ON balancetes(reference_month DESC);

CREATE TABLE balancete_pareceres (
  id TEXT PRIMARY KEY,
  balancete_id TEXT NOT NULL REFERENCES balancetes(id) ON DELETE CASCADE,
  counselor_id TEXT NOT NULL REFERENCES users(id),
  decision TEXT
    CHECK (decision IS NULL OR decision IN ('aprovado', 'aprovado_ressalvas', 'reprovado')),
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'rascunho', 'finalizado')),
  finalized_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (balancete_id, counselor_id)
);
CREATE INDEX idx_balancete_pareceres_balancete ON balancete_pareceres(balancete_id);
CREATE INDEX idx_balancete_pareceres_counselor ON balancete_pareceres(counselor_id);

CREATE TABLE balancete_observacoes (
  id TEXT PRIMARY KEY,
  parecer_id TEXT NOT NULL REFERENCES balancete_pareceres(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('ressalva', 'conferido', 'pendencia')),
  body TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_balancete_observacoes_parecer ON balancete_observacoes(parecer_id);
