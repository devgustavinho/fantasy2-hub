import { api } from "@/lib/api";
import type { Notification } from "@/lib/types";

export const listNotifications = () =>
  api.get<{ notifications: Notification[]; unreadCount: number }>("/notifications");

export const markAllNotificationsRead = () => api.post<void>("/notifications/read-all");

export const markNotificationRead = (id: string) => api.post<void>(`/notifications/${id}/read`);
