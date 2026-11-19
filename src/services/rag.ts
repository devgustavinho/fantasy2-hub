import { api } from "@/lib/api";

export type RagCitation = {
  title: string;
  sourceType: string;
  sourceId: string;
  excerpt: string;
  score: number;
};

export type RagAskResult = {
  answer: string;
  citations: RagCitation[];
  scores?: { title: string; sourceType: string; score: number }[];
};

export type RagStatus = {
  available: boolean;
  openaiConfigured: boolean;
  documents?: number;
  chunks?: number;
  lastUpdatedAt?: string | null;
  bySource?: { sourceType: string; documents: number }[];
  reindexRunning?: boolean;
};

export const getRagStatus = () => api.get<RagStatus>("/rag/status");

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
