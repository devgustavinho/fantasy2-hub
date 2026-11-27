import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Clock, Truck, Users, Volume2, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/QueryError";
import { TowerGroupNudge } from "@/components/TowerGroupNudge";
import * as statsService from "@/services/stats";
import * as horariosService from "@/services/horarios";
import type { HorariosStatus } from "@/services/horarios";
import { cn, formatDateOnly } from "@/lib/utils";

type StatusKey = "mudancaNow" | "noiseNow" | "mudancaTomorrow";

type StatusItem = {
  key: StatusKey;
  Icon: LucideIcon;
  shortLabel: string;
  fullLabel: string;
  answer: string;
  detail: string;
  positive: boolean;
};

function buildStatusItems(status: HorariosStatus): StatusItem[] {
  return [
    {
      key: "mudancaNow",
      Icon: Truck,
      shortLabel: "Mudança",
      fullLabel: "Mudança agora?",
      answer: status.mudancaNow.allowed ? "Sim" : "Não",
      detail: status.mudancaNow.reason,
      positive: status.mudancaNow.allowed,
    },
    {
      key: "noiseNow",
      Icon: Volume2,
      shortLabel: "Barulho",
      fullLabel: "Barulho nas áreas?",
      answer: status.noiseNow.allowed ? "Sim" : "Silêncio",
      detail: status.noiseNow.allowed
        ? `${status.noiseNow.reason} (até ${status.noiseNow.noiseUntil})`
        : `${status.noiseNow.reason} (até ${status.noiseNow.noiseFrom})`,
      positive: status.noiseNow.allowed,
    },
    {
      key: "mudancaTomorrow",
      Icon: Truck,
      shortLabel: "Amanhã",
      fullLabel: "Mudança amanhã?",
      answer: status.mudancaTomorrow.allowed ? "Sim" : "Não",
      detail: `${formatDateOnly(status.mudancaTomorrow.date)} — ${status.mudancaTomorrow.reason}`,
      positive: status.mudancaTomorrow.allowed,
    },
  ];
}

function CondoNowStatus({ status }: { status: HorariosStatus }) {
  const items = buildStatusItems(status);
  const [expanded, setExpanded] = useState<StatusKey | null>(null);
  const active = items.find((item) => item.key === expanded) ?? null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Clock className="h-5 w-5" />
          Agora no condomínio
        </h2>
        <Button asChild variant="ghost" size="sm">
          <Link to="/horarios">Áreas comuns</Link>
        </Button>
      </div>

      {/* Mobile: uma fileira compacta; toque expande o detalhe */}
      <div className="space-y-2 sm:hidden">
        <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Status agora no condomínio">
          {items.map((item) => {
            const isOpen = expanded === item.key;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={isOpen}
                aria-expanded={isOpen}
                aria-controls={`condo-status-${item.key}`}
                id={`condo-status-tab-${item.key}`}
                onClick={() => setExpanded(isOpen ? null : item.key)}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-1.5 text-center transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isOpen ? "border-foreground/25 bg-muted/60" : "bg-card hover:bg-muted/40",
                )}
              >
                <span className="flex items-center gap-1 text-[10px] leading-none text-muted-foreground">
                  <item.Icon className="h-3 w-3 shrink-0" aria-hidden />
                  {item.shortLabel}
                </span>
                <span
                  className={cn(
                    "text-sm font-semibold leading-tight",
                    item.positive ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {item.answer}
                </span>
              </button>
            );
          })}
        </div>
        {active && (
          <div
            id={`condo-status-${active.key}`}
            role="tabpanel"
            aria-labelledby={`condo-status-tab-${active.key}`}
            className="rounded-lg border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground"
          >
            <p className="font-medium text-foreground">{active.fullLabel}</p>
            <p className="mt-1">{active.detail}</p>
          </div>
        )}
      </div>

      {/* Desktop: cards com detalhe visível */}
      <div className="hidden gap-3 sm:grid sm:grid-cols-3">
        {items.map((item) => (
          <Card key={item.key}>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <item.Icon className="h-3.5 w-3.5" />
                {item.fullLabel}
              </CardDescription>
              <CardTitle className="text-xl">
                {item.key === "noiseNow"
                  ? status.noiseNow.allowed
                    ? `Sim (até ${status.noiseNow.noiseUntil})`
                    : `Silêncio (até ${status.noiseNow.noiseFrom})`
                  : item.answer}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">{activeDetail(item, status)}</CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function activeDetail(item: StatusItem, status: HorariosStatus): string {
  if (item.key === "mudancaTomorrow") {
    return `${formatDateOnly(status.mudancaTomorrow.date)} — ${status.mudancaTomorrow.reason}`;
  }
  if (item.key === "noiseNow") return status.noiseNow.reason;
  return status.mudancaNow.reason;
}

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

      <TowerGroupNudge />

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

      {horariosStatus.data && <CondoNowStatus status={horariosStatus.data} />}
    </div>
  );
}
