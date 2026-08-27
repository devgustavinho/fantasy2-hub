import { api } from "@/lib/api";
import type { Recommendation, RecommendationComment } from "@/lib/types";

export const listRecommendations = (tagIds: string[] = []) => {
  const qs = tagIds.length > 0 ? `?tags=${tagIds.join(",")}` : "";
  return api.get<{ recommendations: Recommendation[] }>(`/recommendations${qs}`);
};

export const getRecommendation = (id: string) =>
  api.get<{ recommendation: Recommendation; comments: RecommendationComment[]; myRating: number | null }>(
    `/recommendations/${id}`,
  );

export interface RecommendationInput {
  name: string;
  description?: string;
  whatsapp?: string;
  instagram?: string;
  tagIds?: string[];
}

export const createRecommendation = (data: RecommendationInput) =>
  api.post<{ recommendation: Recommendation }>("/recommendations", data);

export const updateRecommendation = (id: string, data: RecommendationInput) =>
  api.patch<{ recommendation: Recommendation }>(`/recommendations/${id}`, data);

export const deleteRecommendation = (id: string) => api.delete<void>(`/recommendations/${id}`);

export const rateRecommendation = (id: string, stars: number) =>
  api.put<{ recommendation: Recommendation }>(`/recommendations/${id}/rating`, { stars });

export const addRecommendationComment = (id: string, body: string, media: File[]) => {
  const form = new FormData();
  if (body) form.set("body", body);
  for (const file of media) form.append("media", file);
  return api.postForm<{ comments: RecommendationComment[] }>(`/recommendations/${id}/comments`, form);
};

export const deleteRecommendationComment = (id: string, commentId: string) =>
  api.delete<{ comments: RecommendationComment[] }>(`/recommendations/${id}/comments/${commentId}`);
