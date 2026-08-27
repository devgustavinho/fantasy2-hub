import { api } from "@/lib/api";
import type { Tag } from "@/lib/types";

export const listTags = () => api.get<{ tags: Tag[] }>("/tags");

export const createTag = (name: string) => api.post<{ tag: Tag }>("/tags", { name });

export const deleteTag = (id: string) => api.delete<void>(`/tags/${id}`);
