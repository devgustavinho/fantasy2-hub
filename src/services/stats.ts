import { api } from "@/lib/api";
import type { Role } from "@/lib/types";

export type HomeStats = {
  activeTopics: number;
  loginsLast24h: number;
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
  users: AdminLoginUser[];
  refreshedAt: string;
};

export const getHomeStats = () => api.get<HomeStats>("/stats/home");

export const getAdminLoginStats = () => api.get<AdminLoginStats>("/stats/admin/logins");
