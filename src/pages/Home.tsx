import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Clock, Truck, Users, Volume2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/QueryError";
import * as statsService from "@/services/stats";
import * as horariosService from "@/services/horarios";
import { formatDateOnly } from "@/lib/utils";

export default function Home() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["home-stats"],
    queryFn: statsService.getHomeStats,
  });

  const horariosStatus = useQuery({
    queryKey: ["horarios-status"],
    queryFn: horariosService.getHorariosStatus,
    refetchInterval: 60_000,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 pb-28">
      <div>
        <h1 className="text-2xl font-semibold">Início</h1>
        <p className="text-sm text-muted-foreground">
          Visão rápida do Fantasy 2 Hub — pautas, acessos e horários de agora.
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
              <CardTitle className="text-4xl tabular-nums">
                {data.visitsLast24h ?? data.loginsLast24h}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Visitantes distintos que abriram o hub nas últimas 24h (com ou sem login).
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {horariosStatus.data && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Clock className="h-5 w-5" />
              Agora no condomínio
            </h2>
            <Button asChild variant="ghost" size="sm">
              <Link to="/horarios">Ver horários</Link>
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5">
                  <Truck className="h-3.5 w-3.5" />
                  Mudança agora?
                </CardDescription>
                <CardTitle className="text-xl">
                  {horariosStatus.data.mudancaNow.allowed ? "Sim" : "Não"}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {horariosStatus.data.mudancaNow.reason}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5">
                  <Volume2 className="h-3.5 w-3.5" />
                  Barulho nas áreas?
                </CardDescription>
                <CardTitle className="text-xl">
                  {horariosStatus.data.noiseNow.allowed ? "Sim" : "Silêncio"}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {horariosStatus.data.noiseNow.reason}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5">
                  <Truck className="h-3.5 w-3.5" />
                  Mudança amanhã?
                </CardDescription>
                <CardTitle className="text-xl">
                  {horariosStatus.data.mudancaTomorrow.allowed ? "Sim" : "Não"}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {formatDateOnly(horariosStatus.data.mudancaTomorrow.date)} —{" "}
                {horariosStatus.data.mudancaTomorrow.reason}
              </CardContent>
            </Card>
          </div>
        </section>
      )}
    </div>
  );
}
