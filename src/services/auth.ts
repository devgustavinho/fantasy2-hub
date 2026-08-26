import { api } from "@/lib/api";
import type { User } from "@/lib/types";

export interface RegisterInput {
  apartmentId: string;
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export const register = (data: RegisterInput) => api.post<{ user: User }>("/auth/register", data);
export const login = (data: LoginInput) => api.post<{ user: User }>("/auth/login", data);
export const logout = () => api.post<void>("/auth/logout");
export const me = () => api.get<{ user: User }>("/auth/me");
