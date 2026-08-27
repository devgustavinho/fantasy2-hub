import { api } from "@/lib/api";
import type { AuditEntry } from "@/lib/types";

export interface AuditActor {
  id: string;
  name: string;
}

export interface AuditPage {
  entries: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export const listAudit = (params: { page?: number; pageSize?: number; actorUserId?: string | null } = {}) => {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  if (params.actorUserId) search.set("actorUserId", params.actorUserId);
  const qs = search.toString();
  return api.get<AuditPage>(`/audit${qs ? `?${qs}` : ""}`);
};

export const listAuditActors = () => api.get<{ actors: AuditActor[] }>("/audit/actors");
