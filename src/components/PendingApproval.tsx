import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import * as pushService from "@/services/push";

export function PendingApproval({
  status,
  actionLabel = "Sair",
  onAction,
}: {
  status: "pending" | "rejected";
  actionLabel?: string;
  onAction: () => void;
}) {
  const queryClient = useQueryClient();
  const pushSupported = pushService.supportsPush();
  const [pushError, setPushError] = useState<string | null>(null);
  const { data: pushSubscription, isLoading: pushLoading } = useQuery({
    queryKey: ["push-subscription"],
    queryFn: pushService.getCurrentPushSubscription,
    enabled: pushSupported && status === "pending",
  });

  const enablePushMutation = useMutation({
    mutationFn: pushService.enablePush,
    onSuccess: () => {
      setPushError(null);
      queryClient.invalidateQueries({ queryKey: ["push-subscription"] });
    },
    onError: (err) => setPushError(err instanceof Error ? err.message : "Erro ao ativar notificações."),
  });

  const disablePushMutation = useMutation({
    mutationFn: pushService.disablePush,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["push-subscription"] }),
  });

  return (
    <div className="space-y-4 text-center">
      <h2 className="text-lg font-semibold">
        {status === "pending" ? "Cadastro em análise" : "Cadastro recusado"}
      </h2>
      <p className="text-sm text-muted-foreground">
        {status === "pending"
          ? "Sua conta ainda está aguardando aprovação da administração do condomínio. Você recebe acesso assim que for aprovado."
          : "A administração do condomínio recusou este cadastro. Se acha que houve engano, entre em contato com a administração."}
      </p>

      {status === "pending" && pushSupported && !pushLoading && (
        <div className="space-y-2 rounded-md border p-3 text-left">
          <p className="text-sm font-medium">Avise-me quando eu for liberado</p>
          <p className="text-xs text-muted-foreground">
            Ative para receber uma notificação neste aparelho assim que a administração aprovar seu
            cadastro.
          </p>
          {pushError && <p className="text-xs text-destructive">{pushError}</p>}
          {pushSubscription ? (
            <Button
              variant="outline"
              size="sm"
              disabled={disablePushMutation.isPending}
              onClick={() => disablePushMutation.mutate()}
            >
              Desativar aviso
            </Button>
          ) : (
            <Button size="sm" disabled={enablePushMutation.isPending} onClick={() => enablePushMutation.mutate()}>
              {enablePushMutation.isPending ? "Ativando..." : "Avisar quando for liberado"}
            </Button>
          )}
        </div>
      )}

      <Button variant="outline" size="sm" onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  );
}
