import { api } from "@/lib/api";
import type { ManagedUser, Role } from "@/lib/types";

export const listUsers = () => api.get<{ users: ManagedUser[] }>("/users");

export const createSindico = (data: {
  name: string;
  email: string;
  password: string;
  apartmentId?: string | null;
}) => api.post<{ user: ManagedUser }>("/users", data);

export const changeUserRole = (id: string, role: Role) =>
  api.patch<{ user: { id: string; role: Role } }>(`/users/${id}/role`, { role });

export const resetUserPassword = (id: string) =>
  api.patch<{ newPassword: string }>(`/users/${id}/reset-password`);

export const approveUser = (id: string) => api.patch<void>(`/users/${id}/approve`);
export const rejectUser = (id: string) => api.patch<void>(`/users/${id}/reject`);
