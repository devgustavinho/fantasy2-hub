import { api } from "@/lib/api";
import type {
  BalanceteDetail,
  BalanceteSummary,
  ObservacaoTipo,
  ParecerDecision,
} from "@/lib/types";

export const listBalancetes = () => api.get<{ balancetes: BalanceteSummary[] }>("/contabil");

export const getBalancete = (id: string) => api.get<BalanceteDetail>(`/contabil/${id}`);

export function publishBalancete(input: { referenceMonth: string; pdf: File }) {
  const form = new FormData();
  form.set("referenceMonth", input.referenceMonth);
  form.set("pdf", input.pdf);
  return api.postForm<{ balancete: BalanceteSummary }>("/contabil", form);
}

export function saveParecer(
  balanceteId: string,
  input: {
    decision: ParecerDecision;
    observacoes: { tipo: ObservacaoTipo; body: string }[];
    finalize: boolean;
  },
) {
  return api.put<BalanceteDetail>(`/contabil/${balanceteId}/parecer`, input);
}

export const deleteBalancete = (id: string) => api.delete<void>(`/contabil/${id}`);
