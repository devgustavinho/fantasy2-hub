import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, MessageCircleQuestion, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

const PROVIDER_LABEL: Record<string, string> = {
  openai: "OpenAI",
};

export default function AskCondo() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isStaff = user?.role === "admin" || user?.role === "sindico";
  const isAdmin = user?.role === "admin";

  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<"openai">("openai");
  const [apiKey, setApiKey] = useState("");
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ["rag-status"],
    queryFn: ragService.getRagStatus,
  });

  const settingsQuery = useQuery({
    queryKey: ["rag-settings"],
    queryFn: ragService.getRagSettings,
    enabled: isAdmin,
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

  const saveSettingsMutation = useMutation({
    mutationFn: () => ragService.saveRagSettings({ provider, apiKey: apiKey.trim() }),
    onSuccess: () => {
      // Limpa o campo local imediatamente — a key nunca volta do servidor.
      setApiKey("");
      setSettingsMsg("Provedor e chave salvos. A chave não é exibida de novo.");
      queryClient.invalidateQueries({ queryKey: ["rag-settings"] });
      queryClient.invalidateQueries({ queryKey: ["rag-status"] });
    },
    onError: (err) =>
      setSettingsMsg(err instanceof Error ? err.message : "Não foi possível salvar."),
  });

  const clearSettingsMutation = useMutation({
    mutationFn: () => ragService.clearRagSettings(),
    onSuccess: () => {
      setApiKey("");
      setSettingsMsg("Chave removida do cadastro admin.");
      queryClient.invalidateQueries({ queryKey: ["rag-settings"] });
      queryClient.invalidateQueries({ queryKey: ["rag-status"] });
    },
    onError: (err) =>
      setSettingsMsg(err instanceof Error ? err.message : "Não foi possível remover."),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    askMutation.mutate(question.trim());
  }

  function handleSaveSettings(e: FormEvent) {
    e.preventDefault();
    setSettingsMsg(null);
    saveSettingsMutation.mutate();
  }

  const result = askMutation.data;
  const status = statusQuery.data;
  const settings = settingsQuery.data ?? status?.settings;

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
              : isAdmin
                ? "Cadastre o provedor e a API key abaixo para ativar as perguntas."
                : "Perguntas ao condomínio ainda não estão configuradas. Peça ao administrador."}
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <KeyRound className="h-5 w-5" />
              Provedor de IA
            </CardTitle>
            <CardDescription>
              Só admin. A API key é gravada cifrada e nunca é mostrada de volta — só o status
              “configurada”.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              Status:{" "}
              <span className="font-medium">
                {settings?.configured
                  ? `chave configurada (${PROVIDER_LABEL[settings.provider] ?? settings.provider}${
                      settings.source === "env" ? ", via .env" : ""
                    })`
                  : "sem chave"}
              </span>
              {settings?.updatedAt && (
                <span className="text-muted-foreground">
                  {" "}
                  · atualizado {new Date(settings.updatedAt).toLocaleString("pt-BR")}
                </span>
              )}
            </p>
            <form onSubmit={handleSaveSettings} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="rag-provider">Provedor</Label>
                <select
                  id="rag-provider"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as "openai")}
                >
                  <option value="openai">OpenAI</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rag-api-key">API key</Label>
                <Input
                  id="rag-api-key"
                  type="password"
                  autoComplete="new-password"
                  spellCheck={false}
                  placeholder={
                    settings?.configured
                      ? "Cole uma nova key para substituir (não é exibida depois)"
                      : "Cole a API key"
                  }
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  required
                  minLength={16}
                />
              </div>
              {settingsMsg && <p className="text-sm text-muted-foreground">{settingsMsg}</p>}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={saveSettingsMutation.isPending || apiKey.trim().length < 16}>
                  {saveSettingsMutation.isPending ? "Salvando…" : "Salvar provedor e chave"}
                </Button>
                {settings?.source === "admin" && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={clearSettingsMutation.isPending}
                    onClick={() => {
                      if (window.confirm("Remover a chave cadastrada pelo admin?")) {
                        setSettingsMsg(null);
                        clearSettingsMutation.mutate();
                      }
                    }}
                  >
                    Remover chave
                  </Button>
                )}
              </div>
            </form>
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
