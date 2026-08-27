import { api } from "@/lib/api";
import type { FaqEntry } from "@/lib/types";

export const listFaq = () => api.get<{ entries: FaqEntry[] }>("/faq");

export interface FaqInput {
  question: string;
  body: string;
}

export const createFaq = (data: FaqInput) => api.post<{ entries: FaqEntry[] }>("/faq", data);

export const updateFaq = (id: string, data: FaqInput) => api.patch<{ entries: FaqEntry[] }>(`/faq/${id}`, data);

export const deleteFaq = (id: string) => api.delete<void>(`/faq/${id}`);

export const uploadFaqImage = (file: File) => {
  const form = new FormData();
  form.set("image", file);
  return api.postForm<{ url: string }>("/faq/images", form);
};
