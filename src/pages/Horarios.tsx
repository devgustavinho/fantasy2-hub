import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Pencil, Plus, Trash2, Volume2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { QueryError } from "@/components/QueryError";
import { useAuth } from "@/contexts/AuthContext";
import * as horariosService from "@/services/horarios";
import type { CommonArea, MudancaWindow } from "@/services/horarios";
import { formatDateOnly } from "@/lib/utils";

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function formatAreaHours(area: CommonArea) {
  if (area.is24h) return "24 horas";
  if (area.opensAt && area.closesAt) return `${area.opensAt} – ${area.closesAt}`;
  return "—";
}

function formatWindows(windows: MudancaWindow[]) {
  return windows
    .map((w) => {
      const days = w.days
        .slice()
        .sort((a, b) => a - b)
        .map((d) => DAY_LABELS[d])
        .join(", ");
      return `${days}: ${w.opensAt}–${w.closesAt}`;
    })
    .join(" · ");
}

function AreaEditForm({
  area,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  area: CommonArea;
  pending: boolean;
  error: string | null;
  onSubmit: (data: {
    is24h: boolean;
    opensAt: string | null;
    closesAt: string | null;
    assemblyRef: string | null;
    notes: string | null;
  }) => void;
  onCancel: () => void;
}) {
  const [is24h, setIs24h] = useState(area.is24h);
  const [opensAt, setOpensAt] = useState(area.opensAt ?? "08:00");
  const [closesAt, setClosesAt] = useState(area.closesAt ?? "22:00");
  const [assemblyRef, setAssemblyRef] = useState(area.assemblyRef ?? "");
  const [notes, setNotes] = useState(area.notes ?? "");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      is24h,
      opensAt: is24h ? null : opensAt,
      closesAt: is24h ? null : closesAt,
      assemblyRef: assemblyRef.trim() || null,
      notes: notes.trim() || null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={is24h} onChange={(e) => setIs24h(e.target.checked)} />
        Aberto 24 horas
      </label>
      {!is24h && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label>Abre</Label>
            <Input type="time" required value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Fecha</Label>
            <Input type="time" required value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
          </div>
        </div>
      )}
      <div className="space-y-1">
        <Label>Assembleia (opcional)</Label>
        <Input
          value={assemblyRef}
          onChange={(e) => setAssemblyRef(e.target.value)}
          placeholder="Ex.: AG 12/03/2025"
        />
      </div>
      <div className="space-y-1">
        <Label>Observações</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Salvando…" : "Salvar"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function MudancaWindowsEditor({
  initial,
  assemblyRef,
  pending,
  onSave,
}: {
  initial: MudancaWindow[];
  assemblyRef: string | null;
  pending: boolean;
  onSave: (windows: MudancaWindow[], assemblyRef: string | null) => void;
}) {
  const [windows, setWindows] = useState<MudancaWindow[]>(
    initial.length
      ? initial.map((w) => ({ ...w, days: [...w.days] }))
      : [{ days: [1, 2, 3, 4, 5], opensAt: "08:00", closesAt: "18:00" }],
  );
  const [assembly, setAssembly] = useState(assemblyRef ?? "");

  function toggleDay(index: number, day: number) {
    setWindows((prev) =>
      prev.map((w, i) => {
        if (i !== index) return w;
        const has = w.days.includes(day);
        const days = has ? w.days.filter((d) => d !== day) : [...w.days, day].sort((a, b) => a - b);
        return { ...w, days };
      }),
    );
  }

  return (
    <div className="space-y-3 border-t pt-3">
      {windows.map((w, index) => (
        <div key={index} className="space-y-2 rounded-md border bg-background p-3">
          <div className="flex flex-wrap gap-1">
            {DAY_LABELS.map((label, day) => (
              <button
                key={day}
                type="button"
                className={`rounded px-2 py-1 text-xs ${
                  w.days.includes(day) ? "bg-brand-navy text-white" : "bg-muted text-muted-foreground"
                }`}
                onClick={() => toggleDay(index, day)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="time"
              value={w.opensAt}
              onChange={(e) =>
                setWindows((prev) =>
                  prev.map((row, i) => (i === index ? { ...row, opensAt: e.target.value } : row)),
                )
              }
            />
            <Input
              type="time"
              value={w.closesAt}
              onChange={(e) =>
                setWindows((prev) =>
                  prev.map((row, i) => (i === index ? { ...row, closesAt: e.target.value } : row)),
                )
              }
            />
          </div>
          {windows.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setWindows((prev) => prev.filter((_, i) => i !== index))}
            >
              Remover janela
            </Button>
          )}
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setWindows((prev) => [...prev, { days: [6], opensAt: "08:00", closesAt: "12:00" }])
          }
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Janela
        </Button>
      </div>
      <div className="space-y-1">
        <Label>Assembleia (opcional)</Label>
        <Input value={assembly} onChange={(e) => setAssembly(e.target.value)} placeholder="Ex.: AG 03/2024" />
      </div>
      <Button
        type="button"
        size="sm"
        disabled={pending || windows.some((w) => w.days.length === 0)}
        onClick={() => onSave(windows, assembly.trim() || null)}
      >
        {pending ? "Salvando…" : "Salvar janelas"}
      </Button>
    </div>
  );
}

export default function Horarios() {
  const { user } = useAuth();
  const isStaff = user?.role === "admin" || user?.role === "sindico";
  const queryClient = useQueryClient();

  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [areaError, setAreaError] = useState<string | null>(null);
  const [mudancaMsg, setMudancaMsg] = useState<string | null>(null);
  const [noiseUntil, setNoiseUntil] = useState("");
  const [noiseAssembly, setNoiseAssembly] = useState("");
  const [blockDate, setBlockDate] = useState("");
  const [blockReason, setBlockReason] = useState("");

  const bundleQuery = useQuery({
    queryKey: ["horarios"],
    queryFn: horariosService.getHorarios,
  });

  const statusQuery = useQuery({
    queryKey: ["horarios-status"],
    queryFn: horariosService.getHorariosStatus,
    refetchInterval: 60_000,
  });

  const areaMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof horariosService.updateArea>[1] }) =>
      horariosService.updateArea(id, data),
    onSuccess: () => {
      setEditingAreaId(null);
      setAreaError(null);
      queryClient.invalidateQueries({ queryKey: ["horarios"] });
      queryClient.invalidateQueries({ queryKey: ["horarios-status"] });
    },
    onError: (err) => setAreaError(err instanceof Error ? err.message : "Falha ao salvar."),
  });

  const convivenciaMutation = useMutation({
    mutationFn: (data: { noiseUntil: string; assemblyRef?: string | null }) =>
      horariosService.updateConvivencia(data),
    onSuccess: () => {
      setMudancaMsg("Convivência atualizada.");
      queryClient.invalidateQueries({ queryKey: ["horarios"] });
      queryClient.invalidateQueries({ queryKey: ["horarios-status"] });
    },
    onError: (err) =>
      setMudancaMsg(err instanceof Error ? err.message : "Falha ao salvar convivência."),
  });

  const mudancaMutation = useMutation({
    mutationFn: (data: { windows: MudancaWindow[]; assemblyRef?: string | null }) =>
      horariosService.updateMudanca(data),
    onSuccess: () => {
      setMudancaMsg("Janelas de mudança atualizadas.");
      queryClient.invalidateQueries({ queryKey: ["horarios"] });
      queryClient.invalidateQueries({ queryKey: ["horarios-status"] });
    },
    onError: (err) =>
      setMudancaMsg(err instanceof Error ? err.message : "Falha ao salvar janelas."),
  });

  const blockMutation = useMutation({
    mutationFn: () =>
      horariosService.addBlockedDay({ date: blockDate, reason: blockReason, source: "custom" }),
    onSuccess: () => {
      setBlockDate("");
      setBlockReason("");
      queryClient.invalidateQueries({ queryKey: ["horarios"] });
      queryClient.invalidateQueries({ queryKey: ["horarios-status"] });
    },
  });

  const unblockMutation = useMutation({
    mutationFn: (id: string) => horariosService.deleteBlockedDay(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["horarios"] });
      queryClient.invalidateQueries({ queryKey: ["horarios-status"] });
    },
  });

  const mudancaWindowsText = useMemo(
    () => (bundleQuery.data ? formatWindows(bundleQuery.data.mudanca.windows) : ""),
    [bundleQuery.data],
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 pb-28">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Clock className="h-6 w-6" />
          Horários
        </h1>
        <p className="text-sm text-muted-foreground">
          Áreas comuns, mudanças e convivência — fuso America/Fortaleza.
        </p>
      </div>

      {statusQuery.data && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Truck className="h-3.5 w-3.5" />
                Mudança agora
              </CardDescription>
              <CardTitle className="text-lg">
                {statusQuery.data.mudancaNow.allowed ? "Permitida" : "Não"}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {statusQuery.data.mudancaNow.reason}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Volume2 className="h-3.5 w-3.5" />
                Barulho agora
              </CardDescription>
              <CardTitle className="text-lg">
                {statusQuery.data.noiseNow.allowed ? "Permitido" : "Silêncio"}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {statusQuery.data.noiseNow.reason}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Truck className="h-3.5 w-3.5" />
                Mudança amanhã
              </CardDescription>
              <CardTitle className="text-lg">
                {statusQuery.data.mudancaTomorrow.allowed ? "Sim" : "Não"}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {formatDateOnly(statusQuery.data.mudancaTomorrow.date)} —{" "}
              {statusQuery.data.mudancaTomorrow.reason}
            </CardContent>
          </Card>
        </div>
      )}

      {bundleQuery.isLoading && <p className="text-muted-foreground">Carregando…</p>}
      {bundleQuery.isError && <QueryError onRetry={() => bundleQuery.refetch()} />}

      {bundleQuery.data && (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Áreas comuns</h2>
            <ul className="space-y-2">
              {bundleQuery.data.areas.map((area) => (
                <li key={area.id} className="rounded-lg border px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{area.name}</p>
                      <p className="text-sm text-muted-foreground">{formatAreaHours(area)}</p>
                      {area.assemblyRef && (
                        <p className="text-xs text-muted-foreground">Assembleia: {area.assemblyRef}</p>
                      )}
                      {area.notes && <p className="mt-1 text-xs text-muted-foreground">{area.notes}</p>}
                    </div>
                    {isStaff && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="px-2"
                        onClick={() => {
                          setEditingAreaId(editingAreaId === area.id ? null : area.id);
                          setAreaError(null);
                        }}
                        aria-label={`Editar ${area.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {isStaff && editingAreaId === area.id && (
                    <div className="mt-3">
                      <AreaEditForm
                        area={area}
                        pending={areaMutation.isPending}
                        error={areaError}
                        onCancel={() => setEditingAreaId(null)}
                        onSubmit={(data) => areaMutation.mutate({ id: area.id, data })}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Mudanças</h2>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Janelas</CardTitle>
                <CardDescription>{mudancaWindowsText || "Sem janelas cadastradas."}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {bundleQuery.data.mudanca.assemblyRef && (
                  <p className="text-xs text-muted-foreground">
                    Assembleia: {bundleQuery.data.mudanca.assemblyRef}
                  </p>
                )}
                {isStaff && (
                  <MudancaWindowsEditor
                    initial={bundleQuery.data.mudanca.windows}
                    assemblyRef={bundleQuery.data.mudanca.assemblyRef}
                    pending={mudancaMutation.isPending}
                    onSave={(windows, assemblyRef) =>
                      mudancaMutation.mutate({ windows, assemblyRef })
                    }
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Dias bloqueados</CardTitle>
                <CardDescription>
                  Feriados nacionais e de Fortaleza já vêm cadastrados; staff pode acrescentar.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
                  {bundleQuery.data.mudanca.blockedDays.slice(0, 40).map((day) => (
                    <li key={day.id} className="flex items-center justify-between gap-2 py-1">
                      <span>
                        <span className="font-medium tabular-nums">{formatDateOnly(day.date)}</span>
                        <span className="text-muted-foreground"> — {day.reason}</span>
                        <span className="ml-1 text-[10px] uppercase text-muted-foreground">
                          ({day.source})
                        </span>
                      </span>
                      {isStaff && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="px-2"
                          disabled={unblockMutation.isPending}
                          aria-label={`Remover bloqueio ${day.date}`}
                          onClick={() => {
                            if (window.confirm(`Remover bloqueio de ${formatDateOnly(day.date)}?`)) {
                              unblockMutation.mutate(day.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
                {isStaff && (
                  <form
                    className="flex flex-wrap items-end gap-2 border-t pt-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!blockDate || blockReason.trim().length < 2) return;
                      blockMutation.mutate();
                    }}
                  >
                    <div className="space-y-1">
                      <Label htmlFor="block-date">Data</Label>
                      <Input
                        id="block-date"
                        type="date"
                        required
                        value={blockDate}
                        onChange={(e) => setBlockDate(e.target.value)}
                      />
                    </div>
                    <div className="min-w-[12rem] flex-1 space-y-1">
                      <Label htmlFor="block-reason">Motivo</Label>
                      <Input
                        id="block-reason"
                        required
                        value={blockReason}
                        onChange={(e) => setBlockReason(e.target.value)}
                        placeholder="Ex.: Obra na garagem"
                      />
                    </div>
                    <Button type="submit" size="sm" disabled={blockMutation.isPending}>
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Bloquear
                    </Button>
                  </form>
                )}
                {blockMutation.isError && (
                  <p className="text-sm text-destructive">
                    {blockMutation.error instanceof Error
                      ? blockMutation.error.message
                      : "Falha ao bloquear."}
                  </p>
                )}
              </CardContent>
            </Card>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Convivência</h2>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Barulho nas áreas comuns</CardTitle>
                <CardDescription>
                  Permitido até {bundleQuery.data.convivencia.noiseUntil} (fuso Fortaleza).
                  {bundleQuery.data.convivencia.assemblyRef
                    ? ` Assembleia: ${bundleQuery.data.convivencia.assemblyRef}`
                    : ""}
                </CardDescription>
              </CardHeader>
              {isStaff && (
                <CardContent>
                  <form
                    className="flex flex-wrap items-end gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const until = noiseUntil || bundleQuery.data!.convivencia.noiseUntil;
                      const assembly =
                        noiseAssembly || bundleQuery.data!.convivencia.assemblyRef || "";
                      convivenciaMutation.mutate({
                        noiseUntil: until,
                        assemblyRef: assembly.trim() || null,
                      });
                    }}
                  >
                    <div className="space-y-1">
                      <Label htmlFor="noise-until">Até</Label>
                      <Input
                        id="noise-until"
                        type="time"
                        required
                        value={noiseUntil || bundleQuery.data.convivencia.noiseUntil}
                        onChange={(e) => setNoiseUntil(e.target.value)}
                      />
                    </div>
                    <div className="min-w-[10rem] flex-1 space-y-1">
                      <Label htmlFor="noise-assembly">Assembleia (opcional)</Label>
                      <Input
                        id="noise-assembly"
                        value={noiseAssembly || bundleQuery.data.convivencia.assemblyRef || ""}
                        onChange={(e) => setNoiseAssembly(e.target.value)}
                        placeholder="Ex.: AG 05/2024"
                      />
                    </div>
                    <Button type="submit" size="sm" disabled={convivenciaMutation.isPending}>
                      Salvar
                    </Button>
                  </form>
                  {mudancaMsg && <p className="mt-2 text-xs text-muted-foreground">{mudancaMsg}</p>}
                </CardContent>
              )}
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
