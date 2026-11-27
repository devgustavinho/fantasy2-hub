import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { QueryError } from "@/components/QueryError";
import { resolveAuditTarget } from "@/lib/auditLinks";
import type { AuditEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import * as auditService from "@/services/audit";

const ACTION_LABELS: Record<string, string> = {
  "auth.register": "Cadastro",
  "auth.reregister": "Novo pedido após recusa",
  "auth.login": "Login",
  "auth.2fa_enabled": "2FA ativado",
  "auth.forgot_password": "Pedido de redefinição de senha",
  "auth.password_reset_complete": "Senha redefinida",
  "users.create_sindico": "Síndico criado",
  "users.role_change": "Cargo alterado",
  "users.reset_password": "Senha resetada",
  "users.email_change": "E-mail alterado",
  "users.approve": "Cadastro aprovado",
  "users.reject": "Cadastro recusado",
  "topics.create": "Pauta criada",
  "topics.edit": "Pauta editada",
  "topics.delete": "Pauta excluída",
  "topics.schedule": "Pauta agendada",
  "topics.reopen": "Pauta reaberta",
  "topics.close": "Pauta fechada",
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
  "services.tags_set": "Tags do serviço atualizadas",
  "services.photo_set": "Foto do serviço atualizada",
  "services.item_group_create": "Grupo de opção criado",
  "services.item_group_edit": "Grupo de opção editado",
  "services.item_group_delete": "Grupo de opção excluído",
  "services.item_option_create": "Opção criada",
  "services.item_option_edit": "Opção editada",
  "services.item_option_delete": "Opção excluída",
  "climate.create": "Pesquisa de clima criada",
  "climate.close": "Pesquisa de clima encerrada",
  "climate.reopen": "Pesquisa de clima reaberta",
  "climate.delete": "Pesquisa de clima excluída",
  "tags.create": "Tag criada",
  "tags.delete": "Tag excluída",
  "improvements.create": "Melhoria sugerida",
  "improvements.status": "Status de melhoria alterado",
  "improvements.delete": "Melhoria excluída",
  "faq.create": "FAQ criado",
  "faq.edit": "FAQ editado",
  "faq.delete": "FAQ excluído",
  "recommendations.create": "Contato cadastrado",
  "recommendations.edit": "Contato editado",
  "recommendations.delete": "Contato excluído",
  "recommendations.auto_purge_low_rating": "Contato removido (nota baixa)",
  "welcome.update": "Boas-vindas atualizadas",
};

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 25;

function actionBadgeVariant(action: string): "default" | "secondary" | "destructive" | "success" {
  if (action.includes("delete") || action.includes("reject")) return "destructive";
  if (action.includes("approve") || action.includes("create")) return "success";
  return "secondary";
}

function formatDetails(details: AuditEntry["details"]): string | null {
  if (!details) return null;
  const parts = Object.entries(details)
    .filter(([, v]) => v !== null && v !== undefined)
    .filter(([k]) => !["topicId", "serviceId", "recommendationId", "title", "name"].includes(k))
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
  return parts.length ? parts.join(" · ") : null;
}

function pageWindow(current: number, total: number): number[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((p) => pages.add(p));
  if (current >= total - 2) [total - 3, total - 2, total - 1].forEach((p) => pages.add(p));
  return [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
}

export default function AuditLog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSizeRaw = Number(searchParams.get("pageSize")) || DEFAULT_PAGE_SIZE;
  const pageSize = PAGE_SIZE_OPTIONS.includes(pageSizeRaw as (typeof PAGE_SIZE_OPTIONS)[number])
    ? pageSizeRaw
    : DEFAULT_PAGE_SIZE;
  const actorUserId = searchParams.get("actor") ?? "";

  const { data: actorsData } = useQuery({
    queryKey: ["audit-actors"],
    queryFn: auditService.listAuditActors,
  });

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["audit", page, pageSize, actorUserId],
    queryFn: () =>
      auditService.listAudit({ page, pageSize, actorUserId: actorUserId || null }),
    placeholderData: (prev) => prev,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const pages = useMemo(() => pageWindow(page, totalPages), [page, totalPages]);

  function patchParams(next: Record<string, string | null>) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(next)) {
          if (value == null || value === "") params.delete(key);
          else params.set(key, value);
        }
        return params;
      },
      { replace: true },
    );
  }

  function goToPage(next: number) {
    patchParams({ page: next <= 1 ? null : String(next) });
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-6 px-4 py-8">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold">Auditoria</h1>
        <p className="text-sm text-muted-foreground">
          Ações administrativas, de segurança e de conteúdo. Clique no alvo para abrir o registro.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 w-full max-w-xs flex-1 space-y-2 sm:min-w-[200px]">
          <Label htmlFor="actorFilter">Filtrar por pessoa</Label>
          <select
            id="actorFilter"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={actorUserId}
            onChange={(e) => patchParams({ actor: e.target.value || null, page: null })}
          >
            <option value="">Todas as pessoas</option>
            {actorsData?.actors.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pageSize">Por página</Label>
          <select
            id="pageSize"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={pageSize}
            onChange={(e) => patchParams({ pageSize: e.target.value, page: null })}
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        {isFetching && !isLoading && (
          <span className="pb-2 text-xs text-muted-foreground">Atualizando…</span>
        )}
      </div>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">
            Histórico
            {typeof data?.total === "number" && (
              <span className="ml-2 font-normal text-muted-foreground">({data.total})</span>
            )}
          </CardTitle>
          {data && (
            <span className="text-xs text-muted-foreground">
              Página {data.page} de {totalPages}
            </span>
          )}
        </CardHeader>
        <CardContent className="min-w-0 space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {isError && <QueryError onRetry={() => refetch()} />}

          {data && (
            <div className="-mx-1 max-w-full overflow-x-auto overscroll-x-contain rounded-md border [-webkit-overflow-scrolling:touch] sm:mx-0">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">Quando</th>
                    <th className="px-3 py-2 font-medium">Quem</th>
                    <th className="px-3 py-2 font-medium">Ação</th>
                    <th className="px-3 py-2 font-medium">Alvo</th>
                    <th className="px-3 py-2 font-medium">Detalhes</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((entry) => {
                    const target = resolveAuditTarget(entry);
                    const detailsText = formatDetails(entry.details);
                    return (
                      <tr key={entry.id} className="border-b last:border-0 align-top hover:bg-muted/20">
                        <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground tabular-nums">
                          {new Date(entry.createdAt).toLocaleString("pt-BR")}
                        </td>
                        <td className="px-3 py-3">
                          {entry.actorUserId ? (
                            <button
                              type="button"
                              className="font-medium text-left underline-offset-2 hover:underline"
                              onClick={() =>
                                patchParams({ actor: entry.actorUserId, page: null })
                              }
                              title="Filtrar por esta pessoa"
                            >
                              {entry.actorName}
                            </button>
                          ) : (
                            <span className="font-medium">{entry.actorName}</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant={actionBadgeVariant(entry.action)}>
                            {ACTION_LABELS[entry.action] ?? entry.action}
                          </Badge>
                        </td>
                        <td className="px-3 py-3">
                          {target.href ? (
                            <Link
                              to={target.href}
                              className="inline-flex max-w-[280px] items-start gap-1 font-medium text-primary underline-offset-2 hover:underline"
                            >
                              <span className="line-clamp-2">{target.label}</span>
                              <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" />
                            </Link>
                          ) : (
                            <span className="line-clamp-2 text-muted-foreground">{target.label}</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">
                          {detailsText ? (
                            <p className="max-w-sm break-words line-clamp-3">{detailsText}</p>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {data.entries.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">Nenhum registro encontrado.</p>
              )}
            </div>
          )}

          {data && totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => goToPage(page - 1)}
              >
                Anterior
              </Button>
              <div className="flex flex-wrap items-center justify-center gap-1">
                {pages.map((p, idx) => {
                  const prev = pages[idx - 1];
                  const showEllipsis = prev != null && p - prev > 1;
                  return (
                    <span key={p} className="flex items-center gap-1">
                      {showEllipsis && (
                        <span className="px-1 text-xs text-muted-foreground">…</span>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant={p === page ? "default" : "outline"}
                        className={cn("min-w-9", p === page && "pointer-events-none")}
                        onClick={() => goToPage(p)}
                      >
                        {p}
                      </Button>
                    </span>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => goToPage(page + 1)}
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
