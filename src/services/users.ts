import { api } from "@/lib/api";
import type { ManagedUser, Role } from "@/lib/types";

export type ListUsersParams = {
  page?: number;
  pageSize?: number;
  tower?: number | null;
  apartment?: string;
  approvalStatus?: "pending" | "approved" | "rejected";
};

export type ListUsersResult = {
  users: ManagedUser[];
  total: number;
  page: number;
  pageSize: number;
};

export const listUsers = (params: ListUsersParams = {}) => {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  if (params.tower != null) search.set("tower", String(params.tower));
  if (params.apartment) search.set("apartment", params.apartment);
  if (params.approvalStatus) search.set("approvalStatus", params.approvalStatus);
  const qs = search.toString();
  return api.get<ListUsersResult>(`/users${qs ? `?${qs}` : ""}`);
};

export const getUser = (id: string) => api.get<{ user: ManagedUser }>(`/users/${id}`);

export const createSindico = (data: {
  name: string;
  email: string;
  password: string;
  apartmentId?: string | null;
}) => api.post<{ user: ManagedUser }>("/users", data);

export const changeUserRole = (id: string, role: Role) =>
  api.patch<{ user: { id: string; role: Role } }>(`/users/${id}/role`, { role });

export const changeUserEmail = (id: string, email: string) =>
  api.patch<{ user: { id: string; email: string } }>(`/users/${id}/email`, { email });

export const resetUserPassword = (id: string) => api.patch<void>(`/users/${id}/reset-password`);

export const approveUser = (id: string) => api.patch<void>(`/users/${id}/approve`);
export const rejectUser = (id: string, data: { reason?: string } = {}) =>
  api.patch<void>(`/users/${id}/reject`, data);
