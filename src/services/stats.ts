import { api } from "@/lib/api";
import { getVisitorId } from "@/lib/visitorId";
import type { Role } from "@/lib/types";

export type HomeStats = {
  activeTopics: number;
  /** Alias legado; mesmo valor que visitsLast24h. */
  loginsLast24h: number;
  visitsLast24h: number;
};

export type AdminLoginUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  lastLoginAt: string;
  tower: number | null;
  apartmentCode: string | null;
};

export type AdminLoginStats = {
  loginsLast24h: number;
  visitsLast24h: number;
  anonymousVisitsLast24h: number;
  users: AdminLoginUser[];
  refreshedAt: string;
};

export const getHomeStats = () => api.get<HomeStats>("/stats/home");

export const getAdminLoginStats = () => api.get<AdminLoginStats>("/stats/admin/logins");

/** Registra abertura do hub (anônimo ou autenticado). Best-effort. */
export const recordHubVisit = () =>
  api.post<void>("/stats/visit", { visitorId: getVisitorId() });
