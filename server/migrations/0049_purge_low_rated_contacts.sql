-- Contatos do condomínio (ex-recomendações): remove contatos com média < 3.
-- A API também oculta e auto-remove no rating; esta migration limpa o legado.
DELETE FROM recommendations
WHERE id IN (
  SELECT recommendation_id
  FROM recommendation_ratings
  GROUP BY recommendation_id
  HAVING AVG(CAST(stars AS REAL)) < 3
);
