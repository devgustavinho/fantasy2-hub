import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, FileText, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { QueryError } from "@/components/QueryError";
import { useAuth } from "@/contexts/AuthContext";
import {
  BALANCETE_STATUS_META,
  DECISION_META,
  OBS_TIPO_META,
  PARECER_STATUS_META,
} from "@/lib/contabilLabels";
import { activeIsConselheiro, activeIsStaff } from "@/lib/roles";
import type { ObservacaoTipo, ParecerDecision } from "@/lib/types";
import * as contabilService from "@/services/contabil";
import { cn } from "@/lib/utils";

type DraftObs = { key: string; tipo: ObservacaoTipo; body: string };

const DECISIONS: ParecerDecision[] = ["aprovado", "aprovado_ressalvas", "reprovado"];
const OBS_TIPOS: ObservacaoTipo[] = ["ressalva", "conferido", "pendencia"];

export default function ContabilDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Role ativa: staff gerencia; conselheiro dá parecer; morador só lê (PDF + finalizados).
  const canManage = activeIsStaff(user?.role);
  const isCounselor = activeIsConselheiro(user?.role);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["contabil", id],
    queryFn: () => contabilService.getBalancete(id!),
    enabled: !!id,
  });

  const [parecerOpen, setParecerOpen] = useState(false);
  const [decision, setDecision] = useState<ParecerDecision | null>(null);
  const [observacoes, setObservacoes] = useState<DraftObs[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const mine = data?.myParecer;
    if (!mine || mine.status === "finalizado") return;
    if (mine.decision) setDecision(mine.decision);
    if (mine.observacoes.length) {
      setObservacoes(
        mine.observacoes.map((o) => ({
          key: o.id,
          tipo: o.tipo,
          body: o.body,
        })),
      );
    }
  }, [data?.myParecer]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["contabil", id] });
    queryClient.invalidateQueries({ queryKey: ["contabil"] });
  }

  const saveMutation = useMutation({
    mutationFn: (finalize: boolean) =>
      contabilService.saveParecer(id!, {
        decision: decision!,
        observacoes: observacoes
          .filter((o) => o.body.trim())
          .map((o) => ({ tipo: o.tipo, body: o.body.trim() })),
        finalize,
      }),
    onSuccess: () => {
      setParecerOpen(false);
      setFormError(null);
      invalidate();
    },
    onError: (err) => setFormError(err instanceof Error ? err.message : "Erro ao salvar parecer."),
  });

  const deleteMutation = useMutation({
    mutationFn: () => contabilService.deleteBalancete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contabil"] });
      navigate("/contabil");
    },
  });

  function openParecerSheet() {
    setFormError(null);
    setParecerOpen(true);
  }

  function handleSave(e: FormEvent, finalize: boolean) {
    e.preventDefault();
    setFormError(null);
    if (!decision) {
      setFormError("Escolha o parecer: Aprovado, com ressalvas ou Reprovado.");
      return;
    }
    saveMutation.mutate(finalize);
  }

  if (isLoading) {
    return <p className="px-4 py-8 text-muted-foreground">Carregando...</p>;
  }
  if (isError || !data) {
    return (
      <div className="px-4 py-8">
        <QueryError onRetry={() => refetch()} />
      </div>
    );
  }

  const { balancete, analysis, finalizedPareceres, myParecer } = data;
  const statusMeta = BALANCETE_STATUS_META[balancete.status];
  const canGiveParecer = isCounselor && myParecer && myParecer.status !== "finalizado";
  const myFinalized = isCounselor && myParecer?.status === "finalizado";

  return (
    <div className="mx-auto w-full min-w-0 max-w-4xl space-y-5 overflow-x-hidden px-4 py-6 pb-8">
      <div className="flex min-w-0 items-start gap-2">
        <Button asChild variant="ghost" size="sm" className="mt-0.5 shrink-0 px-2">
          <Link to="/contabil">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold leading-tight">{balancete.title}</h1>
            <Badge variant={statusMeta.badge} className="shrink-0 whitespace-nowrap">
              {statusMeta.label}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {balancete.parecerFinalizados} de {balancete.parecerTotal} pareceres · {balancete.publishedByName}
          </p>
        </div>
      </div>

      <Card className="min-w-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Balancete (PDF)</CardTitle>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-col gap-3">
          <a
            href={balancete.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-w-0 items-center gap-2 rounded-lg border bg-muted/40 px-3 py-3 text-sm font-medium text-primary hover:bg-muted"
          >
            <FileText className="h-5 w-5 shrink-0" />
            <span className="min-w-0 truncate">Abrir PDF</span>
            <ExternalLink className="ml-auto h-4 w-4 shrink-0 opacity-70" />
          </a>
          {canGiveParecer && (
            <Button className="w-full" onClick={openParecerSheet}>
              Dar parecer
            </Button>
          )}
          {myFinalized && (
            <p className="text-sm text-muted-foreground">Seu parecer já foi finalizado.</p>
          )}
          {canManage && (
            <Button
              variant="destructive"
              className="w-full"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (window.confirm("Excluir este balancete e todos os pareceres?")) {
                  deleteMutation.mutate();
                }
              }}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Excluir balancete
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Análise do conselho</CardTitle>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-col gap-3">
          {analysis.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum conselheiro cadastrado no momento da publicação.</p>
          )}
          {analysis.map((item) => (
            <div
              key={item.id}
              className="flex min-w-0 flex-col gap-1 rounded-lg border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <p className="min-w-0 truncate text-sm font-medium">{item.counselorName}</p>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline">{PARECER_STATUS_META[item.status]}</Badge>
                {item.decision && (
                  <Badge variant={DECISION_META[item.decision].badge}>
                    {DECISION_META[item.decision].label}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <section className="min-w-0 space-y-3">
        <h2 className="text-base font-semibold">Pareceres finalizados</h2>
        {finalizedPareceres.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Os pareceres só ficam visíveis para moradores após a finalização.
          </p>
        )}
        {finalizedPareceres.map((parecer) => (
          <Card key={parecer.id} className="min-w-0">
            <CardContent className="space-y-3 p-4">
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="min-w-0 truncate font-medium">{parecer.counselorName}</p>
                <Badge variant={DECISION_META[parecer.decision].badge} className="w-fit">
                  {DECISION_META[parecer.decision].label}
                </Badge>
              </div>
              {parecer.observacoes.length > 0 ? (
                <ul className="space-y-2">
                  {parecer.observacoes.map((obs) => (
                    <li key={obs.id} className="rounded-lg bg-muted/40 px-3 py-2">
                      <Badge variant={OBS_TIPO_META[obs.tipo].badge} className="mb-1.5">
                        {OBS_TIPO_META[obs.tipo].label}
                      </Badge>
                      <p className="whitespace-pre-wrap break-words text-sm">{obs.body}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Sem observações.</p>
              )}
            </CardContent>
          </Card>
        ))}
      </section>

      <BottomSheet
        open={parecerOpen}
        onClose={() => {
          if (!saveMutation.isPending) setParecerOpen(false);
        }}
        title="Dar parecer"
        description="Analise o PDF e registre sua decisão."
        className="sm:max-w-lg"
      >
        <form className="space-y-4 overflow-y-auto px-4 pb-6" onSubmit={(e) => handleSave(e, false)}>
          <a
            href={balancete.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium"
          >
            <FileText className="h-4 w-4" />
            Abrir PDF
            <ExternalLink className="h-3.5 w-3.5 opacity-70" />
          </a>

          <div className="space-y-2">
            <Label>Decisão</Label>
            <div className="flex min-w-0 flex-col gap-2">
              {DECISIONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDecision(value)}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
                    decision === value
                      ? "border-primary bg-primary/10 font-medium text-primary"
                      : "hover:bg-muted",
                  )}
                >
                  {DECISION_META[value].label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Observações</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setObservacoes((prev) => [
                    ...prev,
                    { key: crypto.randomUUID(), tipo: "ressalva", body: "" },
                  ])
                }
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Adicionar
              </Button>
            </div>
            {observacoes.length === 0 && (
              <p className="text-xs text-muted-foreground">Opcional: ressalva, conferido ou pendência.</p>
            )}
            {observacoes.map((obs, index) => (
              <div key={obs.key} className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap gap-1.5">
                  {OBS_TIPOS.map((tipo) => (
                    <button
                      key={tipo}
                      type="button"
                      onClick={() =>
                        setObservacoes((prev) =>
                          prev.map((o, i) => (i === index ? { ...o, tipo } : o)),
                        )
                      }
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs",
                        obs.tipo === tipo ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground",
                      )}
                    >
                      {OBS_TIPO_META[tipo].label}
                    </button>
                  ))}
                </div>
                <Textarea
                  rows={3}
                  value={obs.body}
                  placeholder="Descreva a observação…"
                  onChange={(e) =>
                    setObservacoes((prev) =>
                      prev.map((o, i) => (i === index ? { ...o, body: e.target.value } : o)),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => setObservacoes((prev) => prev.filter((_, i) => i !== index))}
                >
                  Remover
                </Button>
              </div>
            ))}
          </div>

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <div className="flex min-w-0 flex-col gap-2">
            <Button
              type="submit"
              variant="outline"
              className="w-full"
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? "Salvando..." : "Salvar rascunho"}
            </Button>
            <Button
              type="button"
              className="w-full"
              disabled={saveMutation.isPending}
              onClick={(e) => handleSave(e, true)}
            >
              Finalizar parecer
            </Button>
          </div>
        </form>
      </BottomSheet>
    </div>
  );
}
