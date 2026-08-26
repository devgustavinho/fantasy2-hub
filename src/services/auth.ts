import { api } from "@/lib/api";
import type { LoginResult, User } from "@/lib/types";

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

export const register = (data: RegisterInput) => api.post<{ status: "pending" }>("/auth/register", data);
export const login = (data: LoginInput) => api.post<LoginResult>("/auth/login", data);
export const logout = () => api.post<void>("/auth/logout");
export const me = () => api.get<{ user: User }>("/auth/me");

export const confirmTotpSetup = (token: string, code: string) =>
  api.post<LoginResult>("/auth/2fa/setup/confirm", { token, code });

export const verifyTotp = (token: string, code: string) =>
  api.post<LoginResult>("/auth/2fa/verify", { token, code });

export const updateMyProfile = (data: { whatsapp?: string | null; whatsappVisible?: boolean }) =>
  api.patch<{ user: User }>("/auth/me", data);
