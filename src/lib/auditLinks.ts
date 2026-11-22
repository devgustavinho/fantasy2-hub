import type { AuditEntry } from "@/lib/types";

export type AuditTarget = {
  /** Rótulo curto do alvo (título, nome, tipo…). */
  label: string;
  /** Rota interna quando dá pra abrir em 1 clique; null se o alvo não é mais navegável. */
  href: string | null;
};

const DELETED_ACTIONS = new Set([
  "topics.delete",
  "services.delete",
  "services.item_delete",
  "services.item_group_delete",
  "services.item_option_delete",
  "climate.delete",
  "tags.delete",
  "improvements.delete",
  "faq.delete",
  "recommendations.delete",
]);

function str(details: Record<string, unknown> | null, key: string): string | null {
  const v = details?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function entityLabel(entityType: string): string {
  switch (entityType) {
    case "topic":
      return "Pauta";
    case "comment":
      return "Comentário";
    case "user":
      return "Usuário";
    case "service":
      return "Serviço";
    case "service_item":
      return "Item de serviço";
    case "recommendation":
      return "Recomendação";
    case "recommendation_comment":
      return "Comentário de recomendação";
    case "climate_survey":
      return "Pesquisa de clima";
    case "portal_improvement":
      return "Melhoria";
    case "faq_entry":
      return "FAQ";
    case "tag":
      return "Tag";
    case "welcome_page":
      return "Boas-vindas";
    default:
      return entityType || "—";
  }
}

/**
 * Resolve rótulo + link do alvo da auditoria.
 * Só gera href quando a tela correspondente existe e o registro provavelmente ainda existe.
 */
export function resolveAuditTarget(entry: AuditEntry): AuditTarget {
  const { entityType, entityId, details, action } = entry;
  const deleted = DELETED_ACTIONS.has(action);
  const typeLabel = entityLabel(entityType);

  if (!entityId) {
    return { label: typeLabel, href: null };
  }

  switch (entityType) {
    case "topic": {
      const title = str(details, "title");
      const label = title ? `${typeLabel}: ${title}` : typeLabel;
      return { label, href: deleted ? null : `/topics/${entityId}` };
    }
    case "comment": {
      const topicId = str(details, "topicId");
      return {
        label: typeLabel,
        href: topicId ? `/topics/${topicId}` : null,
      };
    }
    case "user": {
      return {
        label: typeLabel,
        href: `/admin/usuarios?user=${encodeURIComponent(entityId)}`,
      };
    }
    case "service": {
      const name = str(details, "name");
      return {
        label: name ? `${typeLabel}: ${name}` : typeLabel,
        href: deleted ? null : `/negocios/${entityId}`,
      };
    }
    case "service_item": {
      const serviceId = str(details, "serviceId");
      const name = str(details, "name");
      return {
        label: name ? `${typeLabel}: ${name}` : typeLabel,
        href: serviceId && !deleted ? `/negocios/${serviceId}` : null,
      };
    }
    case "recommendation": {
      const name = str(details, "name");
      return {
        label: name ? `${typeLabel}: ${name}` : typeLabel,
        href: deleted ? null : `/recomendacoes/${entityId}`,
      };
    }
    case "recommendation_comment": {
      const recommendationId = str(details, "recommendationId");
      return {
        label: typeLabel,
        href: recommendationId ? `/recomendacoes/${recommendationId}` : null,
      };
    }
    case "climate_survey": {
      const title = str(details, "title") ?? str(details, "name");
      return {
        label: title ? `${typeLabel}: ${title}` : typeLabel,
        href: deleted ? null : `/clima/${entityId}`,
      };
    }
    case "portal_improvement":
      return { label: typeLabel, href: "/melhorias" };
    case "faq_entry":
      return { label: typeLabel, href: "/faq" };
    case "tag":
      return { label: typeLabel, href: deleted ? null : "/admin/tags" };
    case "welcome_page":
      return { label: typeLabel, href: "/admin/boas-vindas" };
    default:
      return { label: typeLabel, href: null };
  }
}
