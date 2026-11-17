import { api } from "@/lib/api";
import type { Improvement, ImprovementStatus } from "@/lib/types";

export const listImprovements = () =>
  api.get<{ improvements: Improvement[]; statuses: ImprovementStatus[] }>("/improvements");

export const createImprovement = (data: { title: string; description: string }) =>
  api.post<{ improvement: Improvement }>("/improvements", data);

export const updateImprovementStatus = (id: string, status: ImprovementStatus) =>
  api.patch<{ improvement: Improvement }>(`/improvements/${id}/status`, { status });

export const deleteImprovement = (id: string) => api.delete<void>(`/improvements/${id}`);
