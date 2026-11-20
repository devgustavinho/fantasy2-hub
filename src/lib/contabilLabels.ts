import type { BalanceteStatus, ObservacaoTipo, ParecerDecision, ParecerStatus } from "@/lib/types";

export const BALANCETE_STATUS_META: Record<
  BalanceteStatus,
  { label: string; badge: "secondary" | "success" | "default" | "destructive" | "gold" }
> = {
  em_analise: { label: "Em análise", badge: "secondary" },
  aprovado: { label: "Aprovado", badge: "success" },
  aprovado_ressalvas: { label: "Aprovado com ressalvas", badge: "gold" },
  reprovado: { label: "Reprovado", badge: "destructive" },
};

export const DECISION_META: Record<
  ParecerDecision,
  { label: string; badge: "success" | "gold" | "destructive" }
> = {
  aprovado: { label: "Aprovado", badge: "success" },
  aprovado_ressalvas: { label: "Aprovado com ressalvas", badge: "gold" },
  reprovado: { label: "Reprovado", badge: "destructive" },
};

export const PARECER_STATUS_META: Record<ParecerStatus, string> = {
  pendente: "Pendente",
  rascunho: "Rascunho",
  finalizado: "Finalizado",
};

export const OBS_TIPO_META: Record<ObservacaoTipo, { label: string; badge: "gold" | "success" | "destructive" }> = {
  ressalva: { label: "Ressalva", badge: "gold" },
  conferido: { label: "Conferido", badge: "success" },
  pendencia: { label: "Pendência", badge: "destructive" },
};

export function formatReferenceMonth(referenceMonth: string) {
  const [year, month] = referenceMonth.split("-");
  return `${month}/${year}`;
}
