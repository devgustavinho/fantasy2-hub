-- Mesmo vocabulário de tags já usado pelos serviços (tabela `tags`, curada pela administração
-- em `/admin/tags`) — só a associação com a recomendação é nova.
CREATE TABLE recommendation_tags (
  recommendation_id TEXT NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (recommendation_id, tag_id)
);
CREATE INDEX idx_recommendation_tags_tag ON recommendation_tags(tag_id);
