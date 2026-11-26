import { api } from "@/lib/api";

export interface ApiToken {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  active: boolean;
}

export interface ApiTokenCreated {
  token: ApiToken;
  /** Valor em claro — só nesta resposta. */
  value: string;
}

export const listApiTokens = () => api.get<{ tokens: ApiToken[] }>("/api-tokens");

export const createApiToken = (data: { name: string; expiresAt?: string | null }) =>
  api.post<ApiTokenCreated>("/api-tokens", data);

export const revokeApiToken = (id: string) =>
  api.delete<{ token: ApiToken }>(`/api-tokens/${id}`);

export const rotateApiToken = (id: string) =>
  api.post<ApiTokenCreated>(`/api-tokens/${id}/rotate`);
