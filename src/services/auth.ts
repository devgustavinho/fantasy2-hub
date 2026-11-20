import { api } from "@/lib/api";
import type { FamilyMember, LoginResult, User } from "@/lib/types";

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

export const startSessionTotpSetup = () =>
  api.post<{ otpauthUrl: string; qrDataUrl: string }>("/auth/2fa/setup/start");

export const confirmSessionTotpSetup = (code: string) =>
  api.post<{ user: User }>("/auth/2fa/setup/confirm-session", { code });

export const setActiveRole = (role: import("@/lib/types").Role) =>
  api.post<{ user: User }>("/auth/active-role", { role });

export const updateMyProfile = (data: { whatsapp?: string | null; whatsappVisible?: boolean }) =>
  api.patch<{ user: User }>("/auth/me", data);

export const getFamilyMember = () => api.get<{ familyMember: FamilyMember | null }>("/auth/family-member");

export const inviteFamilyMember = (data: { name: string; email: string; password: string }) =>
  api.post<{ familyMember: FamilyMember }>("/auth/family-member", data);

export const requestPasswordReset = (data: { email: string; tower: number; apartmentId: string }) =>
  api.post<void>("/auth/forgot-password", data);

export const confirmPasswordReset = (data: { token: string; password: string }) =>
  api.post<void>("/auth/reset-password", data);
