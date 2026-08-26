import { api } from "@/lib/api";
import type { Comment, Topic, VoteValue } from "@/lib/types";

export const listTopics = () => api.get<{ topics: Topic[] }>("/topics");

export const createTopic = (data: { title: string; description: string }) =>
  api.post<{ topic: Topic }>("/topics", data);

export const getTopic = (id: string) =>
  api.get<{ topic: Topic; comments: Comment[] }>(`/topics/${id}`);

export const voteOnTopic = (id: string, value: VoteValue) =>
  api.post<{ favorCount: number; contraCount: number; myVote: VoteValue }>(`/topics/${id}/vote`, {
    value,
  });

export const commentOnTopic = (id: string, body: string) =>
  api.post<{ comments: Comment[] }>(`/topics/${id}/comments`, { body });

export const scheduleTopic = (id: string, assemblyDate: string | null) =>
  api.patch<{ topic: Topic }>(`/topics/${id}`, { assemblyDate });

export const editTopic = (id: string, data: { title: string; description: string }) =>
  api.patch<{ topic: Topic }>(`/topics/${id}/content`, data);
