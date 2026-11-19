import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircleQuestion, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { QueryError } from "@/components/QueryError";
import { useAuth } from "@/contexts/AuthContext";
import * as ragService from "@/services/rag";

const SOURCE_LABEL: Record<string, string> = {
  faq: "FAQ",
  welcome: "Boas-vindas",
  service: "Serviço",
  recommendation: "Recomendação",
  topic: "Pauta",
};

export default function AskCondo() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isStaff = user?.role === "admin" || user?.role === "sindico";

  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ["rag-status"],
    queryFn: ragService.getRagStatus,
  });

  const askMutation = useMutation({
    mutationFn: (q: string) => ragService.askCondo(q),
    onError: (err) => setError(err instanceof Error ? err.message : "Não foi possível perguntar."),
  });

  const reindexMutation = useMutation({
    mutationFn: (force: boolean) => ragService.reindexRag(force),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rag-status"] });
      setError(null);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Falha ao reindexar."),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    askMutation.mutate(question.trim());
  }

  const result = askMutation.data;
  const status = statusQuery.data;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <MessageCircleQuestion className="h-7 w-7 text-brand-navy" />
          Perguntar
        </h1>
        <p className="text-sm text-muted-foreground">
          Respostas com base no FAQ, página de boas-vindas, serviços, recomendações e atualizações
          oficiais das pautas — sem inventar.
        </p>
      </div>

      {statusQuery.isError && <QueryError onRetry={() => statusQuery.refetch()} />}

      {status && !status.available && (
        <Card className="border-amber-300/60 bg-amber-50 dark:bg-amber-950/30">
          <CardContent className="pt-4 text-sm text-amber-900 dark:text-amber-100">
            {status.openaiConfigured
              ? "O índice ainda está vazio. A administração precisa rodar a reindexação."
              : "Perguntas ao condomínio ainda não estão configuradas no servidor (falta OPENAI_API_KEY)."}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Sua pergunta</CardTitle>
          <CardDescription>Ex.: Qual o horário de silêncio? Quem faz bolo no prédio?</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="rag-question">Pergunta</Label>
              <Textarea
                id="rag-question"
                required
                minLength={3}
                maxLength={500}
                rows={3}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Escreva em português…"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={askMutation.isPending || !question.trim()}>
              {askMutation.isPending ? "Consultando…" : "Perguntar"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Resposta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{result.answer}</p>
            {result.citations.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Fontes
                </p>
                <ul className="space-y-2">
                  {result.citations.map((c) => (
                    <li
                      key={`${c.sourceType}-${c.sourceId}`}
                      className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm"
                    >
                      <span className="font-medium">
                        {SOURCE_LABEL[c.sourceType] ?? c.sourceType}: {c.title}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground line-clamp-2">
                        {c.excerpt}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {isStaff && status && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Índice RAG</CardTitle>
            <CardDescription>Status do corpus semântico (só staff).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <dl className="grid gap-2 sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Documentos</dt>
                <dd className="font-medium tabular-nums">{status.documents ?? 0}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Chunks</dt>
                <dd className="font-medium tabular-nums">{status.chunks ?? 0}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Última atualização</dt>
                <dd className="font-medium">
                  {status.lastUpdatedAt
                    ? new Date(status.lastUpdatedAt).toLocaleString("pt-BR")
                    : "—"}
                </dd>
              </div>
            </dl>
            {status.bySource && status.bySource.length > 0 && (
              <ul className="flex flex-wrap gap-2 text-xs">
                {status.bySource.map((s) => (
                  <li key={s.sourceType} className="rounded-md bg-muted px-2 py-1">
                    {SOURCE_LABEL[s.sourceType] ?? s.sourceType}: {s.documents}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={reindexMutation.isPending || status.reindexRunning || !status.openaiConfigured}
                onClick={() => reindexMutation.mutate(false)}
              >
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${reindexMutation.isPending ? "animate-spin" : ""}`} />
                {reindexMutation.isPending ? "Reindexando…" : "Reindexar"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={reindexMutation.isPending || status.reindexRunning || !status.openaiConfigured}
                onClick={() => reindexMutation.mutate(true)}
              >
                Forçar (re-embed)
              </Button>
            </div>
            {reindexMutation.isSuccess && (
              <p className="text-xs text-muted-foreground">
                Pronto: {reindexMutation.data.upserted} atualizados, {reindexMutation.data.skipped}{" "}
                ignorados, {reindexMutation.data.errors} erros.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
