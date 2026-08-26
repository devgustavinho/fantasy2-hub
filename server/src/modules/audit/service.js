import { randomUUID } from "node:crypto";
import { sqlite } from "../../db/client.js";

const insertAudit = sqlite.prepare(`
  INSERT INTO audit_log (id, actor_user_id, actor_name, action, entity_type, entity_id, details)
  VALUES (@id, @actor_user_id, @actor_name, @action, @entity_type, @entity_id, @details)
`);

// Registra ações administrativas/de segurança e mudanças de conteúdo. Não é chamado pra
// ações triviais (voto, marcar notificação como lida, inscrição de push) — isso encheria
// o log de ruído sem valor de auditoria real.
export function recordAudit({ actorUserId, actorName, action, entityType, entityId, details }) {
  insertAudit.run({
    id: randomUUID(),
    actor_user_id: actorUserId ?? null,
    actor_name: actorName,
    action,
    entity_type: entityType,
    entity_id: entityId ?? null,
    details: details ? JSON.stringify(details) : null,
  });
}
