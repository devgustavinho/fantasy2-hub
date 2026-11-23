import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryError } from "@/components/QueryError";
import { useAuth } from "@/contexts/AuthContext";
import * as topicsService from "@/services/topics";
import * as statsService from "@/services/stats";

// Polling a cada 30 minutos — o contador é barato (COUNT em SQLite) e o requisito do produto
// é atualizar a visão admin nesse intervalo, sem cron/cache no servidor.
const ADMIN_LOGIN_REFETCH_MS = 30 * 60 * 1000;

export default function AdminPanel() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["topics", "open"],
    queryFn: () => topicsService.listTopics("open"),
  });

  const {
    data: loginStats,
    isLoading: loginLoading,
    isError: loginError,
    dataUpdatedAt,
    refetch: refetchLogins,
  } = useQuery({
    queryKey: ["admin-login-stats"],
    queryFn: statsService.getAdminLoginStats,
    enabled: isAdmin,
    refetchInterval: ADMIN_LOGIN_REFETCH_MS,
    refetchIntervalInBackground: false,
  });

  const sorted = [...(data?.topics ?? [])].sort((a, b) => {
    const balanceA = a.favorCount - a.contraCount;
    const balanceB = b.favorCount - b.contraCount;
    return balanceB - balanceA;
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Administração — reclamações mais relevantes</h1>
          <p className="text-sm text-muted-foreground">
            Ordenado por saldo de votos (favor − contra) para ajudar a montar a pauta da próxima assembleia.
          </p>
        </div>
        {isAdmin && (
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/boas-vindas">Página de boas-vindas</Link>
          </Button>
        )}
      </div>

      {isAdmin && (
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Acessos nas últimas 24 horas</CardDescription>
            <CardTitle className="text-4xl tabular-nums">
              {loginLoading
                ? "…"
                : (loginStats?.visitsLast24h ?? loginStats?.loginsLast24h ?? "—")}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Visitantes distintos (navegador), com ou sem login · atualiza a cada 30 minutos
              {dataUpdatedAt
                ? ` · última atualização ${new Date(dataUpdatedAt).toLocaleTimeString("pt-BR", { timeZone: "America/Fortaleza" })}`
                : ""}
              .
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {loginError && <QueryError onRetry={() => refetchLogins()} />}
            {loginStats &&
              (loginStats.visitsLast24h ?? loginStats.loginsLast24h) === 0 && (
              <p className="text-sm text-muted-foreground">Ninguém abriu o hub nas últimas 24 horas.</p>
            )}
            {loginStats && (loginStats.anonymousVisitsLast24h ?? 0) > 0 && (
              <p className="text-sm text-muted-foreground">
                {loginStats.anonymousVisitsLast24h} visita(s) sem conta ligada.
              </p>
            )}
            {loginStats?.users.slice(0, 8).map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {u.name}
                  <span className="text-muted-foreground">
                    {" "}
                    · {u.tower ? `Torre ${u.tower} - ${u.apartmentCode}` : u.role}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(u.lastLoginAt).toLocaleString("pt-BR", { timeZone: "America/Fortaleza" })}
                </span>
              </div>
            ))}
            {loginStats && loginStats.users.length > 8 && (
              <p className="text-xs text-muted-foreground">
                +{loginStats.users.length - 8} outras contas no período.
              </p>
            )}
            <Button type="button" size="sm" variant="outline" onClick={() => refetchLogins()}>
              Atualizar agora
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading && <p className="text-muted-foreground">Carregando...</p>}
      {isError && <QueryError onRetry={() => refetch()} />}

      <div className="space-y-3">
        {sorted.map((topic, index) => (
          <Link key={topic.id} to={`/topics/${topic.id}`}>
            <Card className="transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    <span className="mr-2 text-muted-foreground">#{index + 1}</span>
                    {topic.title}
                  </CardTitle>
                  <Badge variant="secondary">Em aberto</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex items-center gap-4 pt-0 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  saldo {topic.favorCount - topic.contraCount >= 0 ? "+" : ""}
                  {topic.favorCount - topic.contraCount}
                </span>
                <span>👍 {topic.favorCount}</span>
                <span>👎 {topic.contraCount}</span>
                <span>💬 {topic.commentCount ?? 0}</span>
                <span className="ml-auto">por {topic.createdByName}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
        {data && data.topics.length === 0 && (
          <p className="text-muted-foreground">Nenhuma pauta em aberto no momento.</p>
        )}
      </div>
    </div>
  );
}
