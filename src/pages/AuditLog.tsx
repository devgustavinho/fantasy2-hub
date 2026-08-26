import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
};

function actionBadgeVariant(action: string): "default" | "secondary" | "destructive" | "success" {
  if (action.includes("delete") || action.includes("reject")) return "destructive";
  if (action.includes("approve") || action.includes("create")) return "success";
  return "secondary";
}

export default function AuditLog() {
  const { data, isLoading } = useQuery({ queryKey: ["audit"], queryFn: auditService.listAudit });

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Auditoria</h1>
        <p className="text-sm text-muted-foreground">
          Últimas ações administrativas e de segurança registradas no sistema.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico ({data?.entries.length ?? 0})</CardTitle>
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
            <p className="text-sm text-muted-foreground">Nenhum registro ainda.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
