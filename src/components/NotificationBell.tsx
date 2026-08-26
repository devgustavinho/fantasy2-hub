import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import * as notificationsService from "@/services/notifications";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: notificationsService.listNotifications,
    refetchInterval: 30000,
  });

  const markReadMutation = useMutation({
    mutationFn: notificationsService.markNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: notificationsService.markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  function handleNotificationClick(id: string, topicId: string) {
    markReadMutation.mutate(id);
    setOpen(false);
    navigate(`/topics/${topicId}`);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        aria-label="Notificações"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-pink px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-80 max-w-[90vw] rounded-lg border bg-card text-card-foreground shadow-lg">
            <div className="flex items-center justify-between border-b p-3">
              <span className="text-sm font-medium">Notificações</span>
              {unreadCount > 0 && (
                <button
                  className="text-xs text-primary hover:underline"
                  onClick={() => markAllReadMutation.mutate()}
                >
                  Marcar todas como lidas
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 && (
                <p className="p-4 text-center text-sm text-muted-foreground">Nenhuma notificação ainda.</p>
              )}
              {notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleNotificationClick(n.id, n.topicId)}
                  className={`block w-full border-b p-3 text-left text-sm last:border-b-0 hover:bg-accent/40 ${
                    n.readAt ? "text-muted-foreground" : "font-medium"
                  }`}
                >
                  <p>{n.message}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(n.createdAt).toLocaleString("pt-BR")}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
