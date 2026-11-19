import { api } from "@/lib/api";

export type RagCitation = {
  title: string;
  sourceType: string;
  sourceId: string;
  excerpt: string;
  score: number;
};

export type RagAskQuota = {
  limit: number;
  remaining: number;
  resetAt: string | null;
  windowHours: number;
};

export type RagAskResult = {
  answer: string;
  citations: RagCitation[];
  scores?: { title: string; sourceType: string; score: number }[];
  quota?: RagAskQuota;
};

export type RagSettings = {
  provider: "openai";
  configured: boolean;
  source: "admin" | "env" | null;
  updatedAt: string | null;
};

export type RagStatus = {
  available: boolean;
  openaiConfigured: boolean;
  documents?: number;
  chunks?: number;
  lastUpdatedAt?: string | null;
  bySource?: { sourceType: string; documents: number }[];
  reindexRunning?: boolean;
  settings?: RagSettings;
};

export const getRagStatus = () => api.get<RagStatus>("/rag/status");

export const getRagSettings = () => api.get<RagSettings>("/rag/settings");

/** Salva provedor + key. A resposta NUNCA traz a key — só configured/source. */
export const saveRagSettings = (data: { provider: "openai"; apiKey: string }) =>
  api.put<RagSettings>("/rag/settings", data);

export const clearRagSettings = () => api.delete<RagSettings>("/rag/settings");

export const askCondo = (question: string) =>
  api.post<RagAskResult>("/rag/ask", { question });

export const reindexRag = (force = false) =>
  api.post<{
    total: number;
    upserted: number;
    skipped: number;
    errors: number;
    status: RagStatus;
  }>("/rag/reindex", { force });

export type RagExternalEmbed = {
  id: string;
  title: string;
  filename: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string };
  chunkCount: number;
  bodyChars: number;
};

export const listRagEmbeds = () => api.get<{ embeds: RagExternalEmbed[] }>("/rag/embeds");

export const uploadRagEmbedFile = (file: File, title?: string) => {
  const form = new FormData();
  form.set("file", file);
  if (title?.trim()) form.set("title", title.trim());
  return api.postForm<{ embed: RagExternalEmbed; status: RagStatus }>("/rag/embeds", form);
};

export const createRagEmbedText = (data: { title: string; body: string }) =>
  api.post<{ embed: RagExternalEmbed; status: RagStatus }>("/rag/embeds", data);

export const deleteRagEmbed = (id: string) =>
  api.delete<{ ok: true; status: RagStatus }>(`/rag/embeds/${id}`);
