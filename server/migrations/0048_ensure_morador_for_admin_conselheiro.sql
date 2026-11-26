-- Admin e conselheiro são sempre também morador (síndico pode ser profissional).
INSERT OR IGNORE INTO user_roles (user_id, role)
SELECT DISTINCT ur.user_id, 'morador'
FROM user_roles ur
WHERE ur.role IN ('admin', 'conselheiro')
  AND NOT EXISTS (
    SELECT 1 FROM user_roles m
    WHERE m.user_id = ur.user_id AND m.role = 'morador'
  );
