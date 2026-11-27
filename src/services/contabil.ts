import { api } from "@/lib/api";
import type {
  BalanceteDetail,
  BalanceteSummary,
  ObservacaoTipo,
  ParecerDecision,
} from "@/lib/types";

/** Alinhado com multer em server/src/modules/contabil/routes.js e nginx client_max_body_size. */
export const MAX_BALANCETE_PDF_BYTES = 150 * 1024 * 1024;
export const MAX_BALANCETE_PDF_MB = 150;

export function balancetePdfTooLargeMessage(sizeBytes: number) {
  const sizeMb = sizeBytes / (1024 * 1024);
  return `O PDF do balancete pode ter no máximo ${MAX_BALANCETE_PDF_MB} MB. Este arquivo tem ${sizeMb.toFixed(1)} MB.`;
}

export const listBalancetes = () => api.get<{ balancetes: BalanceteSummary[] }>("/contabil");

export const getBalancete = (id: string) => api.get<BalanceteDetail>(`/contabil/${id}`);

export function publishBalancete(input: { referenceMonth: string; pdf: File }) {
  if (input.pdf.size > MAX_BALANCETE_PDF_BYTES) {
    return Promise.reject(new Error(balancetePdfTooLargeMessage(input.pdf.size)));
  }
  const form = new FormData();
  form.set("referenceMonth", input.referenceMonth);
  form.set("pdf", input.pdf);
  // PDFs grandes (até 150 MB) precisam de mais que o timeout padrão de 20s.
  return api.postForm<{ balancete: BalanceteSummary }>("/contabil", form, {
    timeoutMs: 15 * 60 * 1000,
  });
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
