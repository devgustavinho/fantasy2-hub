import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import * as auditService from "@/services/audit";

const ACTION_LABELS: Record<string, string> = {
  "auth.register": "Cadastro",
  "auth.login": "Login",
  "auth.2fa_enabled": "2FA ativado",
  "users.create_sindico": "Síndico criado",
  "users.role_change": "Cargo alterado",
  "users.reset_password": "Senha resetada",
  "users.approve": "Cadastro aprovado",
  "users.reject": "Cadastro recusado",
  "topics.create": "Pauta criada",
  "topics.edit": "Pauta editada",
  "topics.delete": "Pauta excluída",
  "topics.schedule": "Pauta agendada",
  "topics.reopen": "Pauta reaberta",
  "topics.status_note": "Atualização de pauta",
  "topics.vote": "Voto registrado",
  "comments.create": "Comentário criado",
  "comments.edit": "Comentário editado",
  "services.create": "Serviço cadastrado",
  "services.edit": "Serviço editado",
  "services.delete": "Serviço excluído",
  "services.item_create": "Item de serviço criado",
  "services.item_edit": "Item de serviço editado",
  "services.item_delete": "Item de serviço excluído",
};

function actionBadgeVariant(action: string): "default" | "secondary" | "destructive" | "success" {
  if (action.includes("delete") || action.includes("reject")) return "destructive";
  if (action.includes("approve") || action.includes("create")) return "success";
  return "secondary";
}

const PAGE_SIZE = 50;

export default function AuditLog() {
  const [page, setPage] = useState(1);
  const [actorUserId, setActorUserId] = useState<string>("");

  const { data: actorsData } = useQuery({
    queryKey: ["audit-actors"],
    queryFn: auditService.listAuditActors,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["audit", page, actorUserId],
    queryFn: () => auditService.listAudit({ page, pageSize: PAGE_SIZE, actorUserId: actorUserId || null }),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  function handleActorChange(value: string) {
    setActorUserId(value);
    setPage(1);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Auditoria</h1>
        <p className="text-sm text-muted-foreground">
          Ações administrativas, de segurança e de conteúdo registradas no sistema.
        </p>
      </div>

      <div className="max-w-xs space-y-2">
        <Label htmlFor="actorFilter">Filtrar por pessoa</Label>
        <select
          id="actorFilter"
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={actorUserId}
          onChange={(e) => handleActorChange(e.target.value)}
        >
          <option value="">Todas as pessoas</option>
          {actorsData?.actors.map((actor) => (
            <option key={actor.id} value={actor.id}>
              {actor.name}
            </option>
          ))}
        </select>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Histórico ({data?.total ?? 0})</CardTitle>
          {data && (
            <span className="text-xs text-muted-foreground">
              Página {data.page} de {totalPages}
            </span>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {data?.entries.map((entry) => (
            <div key={entry.id} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={actionBadgeVariant(entry.action)}>
                  {ACTION_LABELS[entry.action] ?? entry.action}
                </Badge>
                <span className="font-medium">{entry.actorName}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleString("pt-BR")}
                </span>
              </div>
              {entry.details && (
                <p className="mt-1.5 break-words text-xs text-muted-foreground">
                  {Object.entries(entry.details)
                    .filter(([, v]) => v !== null && v !== undefined)
                    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
                    .join(" · ")}
                </p>
              )}
            </div>
          ))}
          {data && data.entries.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum registro encontrado.</p>
          )}

          {data && data.total > data.pageSize && (
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <span className="text-xs text-muted-foreground">
                Página {page} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Próxima
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
