export const TOPIC_SORTS = [
  { value: "vote_balance", label: "Saldo de votos" },
  { value: "oldest", label: "Mais antigas → mais novas" },
  { value: "newest", label: "Mais novas → mais antigas" },
  { value: "most_comments", label: "Mais debatida" },
  { value: "least_comments", label: "Menos debatida" },
] as const;

export type TopicSort = (typeof TOPIC_SORTS)[number]["value"];

export const DEFAULT_TOPIC_SORT: TopicSort = "newest";

export function parseTopicSort(value: string | null | undefined): TopicSort {
  if (TOPIC_SORTS.some((s) => s.value === value)) return value as TopicSort;
  return DEFAULT_TOPIC_SORT;
}
