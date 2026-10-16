CREATE TABLE climate_surveys (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  allow_comments INTEGER NOT NULL DEFAULT 0 CHECK (allow_comments IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_climate_surveys_created ON climate_surveys(created_at);

CREATE TABLE climate_questions (
  id TEXT PRIMARY KEY,
  survey_id TEXT NOT NULL REFERENCES climate_surveys(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  position INTEGER NOT NULL
);

CREATE INDEX idx_climate_questions_survey ON climate_questions(survey_id, position);

CREATE TABLE climate_options (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES climate_questions(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  position INTEGER NOT NULL
);

CREATE INDEX idx_climate_options_question ON climate_options(question_id, position);

-- Uma linha por apartamento: o titular responde, familiar não cria outra resposta.
CREATE TABLE climate_responses (
  id TEXT PRIMARY KEY,
  survey_id TEXT NOT NULL REFERENCES climate_surveys(id) ON DELETE CASCADE,
  apartment_id TEXT NOT NULL REFERENCES apartments(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (survey_id, apartment_id)
);

CREATE INDEX idx_climate_responses_survey ON climate_responses(survey_id);

CREATE TABLE climate_answers (
  id TEXT PRIMARY KEY,
  response_id TEXT NOT NULL REFERENCES climate_responses(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES climate_questions(id) ON DELETE CASCADE,
  option_id TEXT NOT NULL REFERENCES climate_options(id),
  UNIQUE (response_id, question_id)
);

CREATE INDEX idx_climate_answers_question ON climate_answers(question_id, option_id);
