import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/QueryError";
import * as statsService from "@/services/stats";

export default function Home() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["home-stats"],
    queryFn: statsService.getHomeStats,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Início</h1>
        <p className="text-sm text-muted-foreground">
          Visão rápida do Fantasy 2 Hub — pautas em aberto e movimento de acesso.
        </p>
      </div>

      {isLoading && <p className="text-muted-foreground">Carregando...</p>}
      {isError && <QueryError onRetry={() => refetch()} />}

      {data && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4" />
                Pautas ativas
              </CardDescription>
              <CardTitle className="text-4xl tabular-nums">{data.activeTopics}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Pautas em aberto aguardando assembleia.</p>
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link to="/pautas">Ver pautas</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Acessos nas últimas 24h
              </CardDescription>
              <CardTitle className="text-4xl tabular-nums">{data.loginsLast24h}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Pessoas distintas que entraram no hub no último dia.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
