import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { QueryError } from "@/components/QueryError";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import * as climateService from "@/services/climate";
import type { ClimateSurvey } from "@/lib/types";

function formatPercent(value: number) {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export default function ClimateDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "admin";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["climate", id],
    queryFn: () => climateService.getSurvey(id!),
    enabled: !!id,
  });

  const [tab, setTab] = useState<"perguntas" | "comentarios">("perguntas");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const survey = data?.survey;

  function replaceSurvey(next: ClimateSurvey) {
    queryClient.setQueryData(["climate", id], { survey: next });
    queryClient.invalidateQueries({ queryKey: ["climate"] });
  }

  const respondMutation = useMutation({
    mutationFn: () =>
      climateService.respondSurvey(id!, {
        answers: (survey?.questions ?? []).map((question) => ({
          questionId: question.id,
          optionId: answers[question.id],
        })),
        comment: survey?.allowComments ? comment : undefined,
      }),
    onSuccess: ({ survey: next }) => {
      setError(null);
      replaceSurvey(next);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Erro ao enviar a resposta."),
  });

  const statusMutation = useMutation({
    mutationFn: (status: "open" | "closed") => climateService.setSurveyStatus(id!, status),
    onSuccess: ({ survey: next }) => replaceSurvey(next),
    onError: (err) => setError(err instanceof Error ? err.message : "Erro ao atualizar a pesquisa."),
  });

  const deleteMutation = useMutation({
    mutationFn: () => climateService.deleteSurvey(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["climate"] });
      navigate("/clima");
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Erro ao excluir a pesquisa."),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!survey) return;
    const missing = survey.questions.some((question) => !answers[question.id]);
    if (missing) {
      setTab("perguntas");
      setError("Responda todas as perguntas antes de enviar.");
      return;
    }
    setError(null);
    respondMutation.mutate();
  }

  function handleDelete() {
    if (!survey) return;
    if (window.confirm(`Excluir a pesquisa "${survey.title}"? As respostas também são apagadas.`)) {
      deleteMutation.mutate();
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <Link to="/clima" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar para pesquisas
      </Link>

      {isLoading && <p className="text-muted-foreground">Carregando...</p>}
      {isError && <QueryError onRetry={() => refetch()} />}

      {survey && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold">{survey.title}</h1>
                <Badge variant={survey.status === "open" ? "success" : "secondary"}>
                  {survey.status === "open" ? "Aberta" : "Encerrada"}
                </Badge>
              </div>
              {survey.description && <p className="text-sm text-muted-foreground">{survey.description}</p>}
              <p className="text-sm text-muted-foreground">
                {survey.responseCount} {survey.responseCount === 1 ? "apartamento respondeu" : "apartamentos responderam"}
                {" · "}
                {new Date(survey.createdAt).toLocaleDateString("pt-BR")}
              </p>
            </div>
            {isAdmin && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={statusMutation.isPending}
                  onClick={() => statusMutation.mutate(survey.status === "open" ? "closed" : "open")}
                >
                  {survey.status === "open" ? "Encerrar" : "Reabrir"}
                </Button>
                <Button type="button" variant="destructive" disabled={deleteMutation.isPending} onClick={handleDelete}>
                  Excluir
                </Button>
              </div>
            )}
          </div>

          <div className="flex gap-2 border-b">
            <button
              type="button"
              className={cn(
                "border-b-2 px-3 py-2 text-sm font-medium",
                tab === "perguntas" ? "border-primary text-foreground" : "border-transparent text-muted-foreground",
              )}
              onClick={() => setTab("perguntas")}
            >
              Perguntas
            </button>
            {survey.allowComments && (
              <button
                type="button"
                className={cn(
                  "border-b-2 px-3 py-2 text-sm font-medium",
                  tab === "comentarios" ? "border-primary text-foreground" : "border-transparent text-muted-foreground",
                )}
                onClick={() => setTab("comentarios")}
              >
                Comentários gerais
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === "perguntas" && (
              <div className="space-y-4">
                {survey.questions.map((question, index) => (
                  <Card key={question.id}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        {index + 1}. {question.prompt}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {question.options.map((option) => {
                        const selected = survey.voted ? option.selected : answers[question.id] === option.id;
                        return (
                          <label
                            key={option.id}
                            className={cn(
                              "flex gap-3 rounded-md border p-3",
                              selected && "border-primary bg-primary/5",
                              survey.canVote ? "cursor-pointer" : "cursor-default",
                            )}
                          >
                            <input
                              type="radio"
                              name={question.id}
                              className="mt-1"
                              checked={selected}
                              disabled={!survey.canVote}
                              onChange={() => setAnswers((current) => ({ ...current, [question.id]: option.id }))}
                            />
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-center justify-between gap-3">
                                <span>{option.label}</span>
                                <span className="shrink-0 text-sm font-medium tabular-nums">
                                  {formatPercent(option.percent)}
                                </span>
                              </div>
                              <div className="h-2 overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full bg-primary"
                                  style={{ width: `${Math.min(option.percent, 100)}%` }}
                                />
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {option.count} {option.count === 1 ? "apartamento" : "apartamentos"}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </CardContent>
                  </Card>
                ))}
                {survey.allowComments && survey.canVote && (
                  <p className="text-sm text-muted-foreground">
                    A última aba é de comentários gerais, se quiser deixar um recado junto da resposta.
                  </p>
                )}
              </div>
            )}

            {tab === "comentarios" && survey.allowComments && (
              <div className="space-y-4">
                {survey.canVote && (
                  <div className="space-y-2">
                    <Label htmlFor="climate-comment">Comentário geral (opcional)</Label>
                    <Textarea
                      id="climate-comment"
                      rows={4}
                      maxLength={2000}
                      placeholder="Algo que as opções não cobriram"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                    />
                  </div>
                )}
                {survey.voted && survey.myComment && (
                  <p className="text-sm text-muted-foreground">Seu comentário já foi enviado com a resposta do apartamento.</p>
                )}
                {survey.comments.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhum comentário geral ainda.</p>
                )}
                {survey.comments.map((entry) => (
                  <Card key={entry.id}>
                    <CardContent className="space-y-1 pt-4 text-sm">
                      <p className="font-medium">
                        {entry.authorName} · Torre {entry.tower} - {entry.apartmentCode}
                      </p>
                      <p className="whitespace-pre-wrap">{entry.body}</p>
                      <p className="text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleString("pt-BR")}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {survey.voteMessage && <p className="text-sm text-muted-foreground">{survey.voteMessage}</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}
            {survey.canVote && (
              <Button type="submit" disabled={respondMutation.isPending}>
                {respondMutation.isPending ? "Enviando..." : "Enviar resposta do apartamento"}
              </Button>
            )}
          </form>
        </>
      )}
    </div>
  );
}
