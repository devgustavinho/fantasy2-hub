import { api } from "@/lib/api";
import type { GroupLinksAll, GroupLinksForUser, GroupLinksInput } from "@/lib/types";

export const getGroupLinks = () => api.get<GroupLinksForUser>("/group-links");

export const getGroupLinksAll = () => api.get<GroupLinksAll>("/group-links/all");

export const updateGroupLinks = (data: GroupLinksInput) =>
  api.put<GroupLinksAll>("/group-links", data);
