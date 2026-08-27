ALTER TABLE users ADD COLUMN household_role TEXT NOT NULL DEFAULT 'owner'
  CHECK (household_role IN ('owner', 'family'));
ALTER TABLE users ADD COLUMN invited_by TEXT REFERENCES users(id);

DROP INDEX idx_users_apartment;

-- No máximo 1 "owner" e 1 "family" por apartamento (par apartment_id+household_role único) —
-- é isso que permite exatamente um morador titular + um familiar convidado, sem abrir pra
-- qualquer quantidade de contas por apartamento.
CREATE UNIQUE INDEX idx_users_apartment_household ON users(apartment_id, household_role)
  WHERE apartment_id IS NOT NULL;
