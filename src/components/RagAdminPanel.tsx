import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileUp, KeyRound, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import * as ragService from "@/services/rag";

const SOURCE_LABEL: Record<string, string> = {
  faq: "FAQ",
  welcome: "Boas-vindas",
  service: "Negócio",
  recommendation: "Recomendação",
  topic: "Pauta",
  external: "Embed",
  manual: "Manual",
};

const PROVIDER_LABEL: Record<string, string> = {
  openai: "OpenAI",
};

type RagAdminPanelProps = {
  /** Quando false, não dispara queries de settings/embeds (ex.: sheet fechado). Default true. */
  enabled?: boolean;
  className?: string;
};

/** Provedor, embeds e reindexação RAG — usado no hub de Configurações e no sheet de Perguntar. */
export function RagAdminPanel({ enabled = true, className }: RagAdminPanelProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isStaff = user?.role === "admin" || user?.role === "sindico";
  const isAdmin = user?.role === "admin";

  const [provider, setProvider] = useState<"openai">("openai");
  const [apiKey, setApiKey] = useState("");
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);
  const [embedTitle, setEmbedTitle] = useState("");
  const [embedMsg, setEmbedMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const statusQuery = useQuery({
    queryKey: ["rag-status"],
    queryFn: ragService.getRagStatus,
    enabled: enabled && isStaff,
  });

  const settingsQuery = useQuery({
    queryKey: ["rag-settings"],
    queryFn: ragService.getRagSettings,
    enabled: enabled && isAdmin,
  });

  const embedsQuery = useQuery({
    queryKey: ["rag-embeds"],
    queryFn: ragService.listRagEmbeds,
    enabled: enabled && isAdmin,
  });

  const reindexMutation = useMutation({
    mutationFn: (force: boolean) => ragService.reindexRag(force),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rag-status"] }),
  });

  const saveSettingsMutation = useMutation({
    mutationFn: () => ragService.saveRagSettings({ provider, apiKey: apiKey.trim() }),
    onSuccess: () => {
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

  const uploadEmbedMutation = useMutation({
    mutationFn: (file: File) => ragService.uploadRagEmbedFile(file, embedTitle || undefined),
    onSuccess: (data) => {
      setEmbedTitle("");
      setEmbedMsg(`Indexado: ${data.embed.title} (${data.embed.chunkCount} chunks).`);
      if (fileRef.current) fileRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["rag-embeds"] });
      queryClient.invalidateQueries({ queryKey: ["rag-status"] });
    },
    onError: (err) =>
      setEmbedMsg(err instanceof Error ? err.message : "Falha ao indexar o arquivo."),
  });

  const deleteEmbedMutation = useMutation({
    mutationFn: (id: string) => ragService.deleteRagEmbed(id),
    onSuccess: () => {
      setEmbedMsg("Embed removido do índice.");
      queryClient.invalidateQueries({ queryKey: ["rag-embeds"] });
      queryClient.invalidateQueries({ queryKey: ["rag-status"] });
    },
    onError: (err) =>
      setEmbedMsg(err instanceof Error ? err.message : "Falha ao remover."),
  });

  function handleSaveSettings(e: FormEvent) {
    e.preventDefault();
    setSettingsMsg(null);
    saveSettingsMutation.mutate();
  }

  const status = statusQuery.data;
  const settings = settingsQuery.data ?? status?.settings;

  if (!isStaff) return null;

  return (
    <div className={className ?? "space-y-6"}>
      {isAdmin && (
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="h-4 w-4" />
            Provedor de IA
          </h3>
          <p className="text-xs text-muted-foreground">
            Só admin. A API key fica cifrada e nunca é mostrada de volta.
          </p>
          <p className="text-sm">
            Status:{" "}
            <span className="font-medium">
              {settings?.configured
                ? `chave configurada (${PROVIDER_LABEL[settings.provider] ?? settings.provider}${
                    settings.source === "env" ? ", via .env" : ""
                  })`
                : "sem chave"}
            </span>
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
                    ? "Nova key para substituir (não reaparece)"
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
              <Button
                type="submit"
                size="sm"
                disabled={saveSettingsMutation.isPending || apiKey.trim().length < 16}
              >
                {saveSettingsMutation.isPending ? "Salvando…" : "Salvar"}
              </Button>
              {settings?.source === "admin" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
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
        </section>
      )}

      {isAdmin && (
        <section className="space-y-3 border-t pt-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <FileUp className="h-4 w-4" />
            Embeds externos
          </h3>
          <p className="text-xs text-muted-foreground">
            Texto só por enquanto (.txt, .md…). O arquivo é chunked e indexado no RAG.
          </p>
          <div className="space-y-2">
            <Label htmlFor="rag-embed-title">Título (opcional)</Label>
            <Input
              id="rag-embed-title"
              value={embedTitle}
              onChange={(e) => setEmbedTitle(e.target.value)}
              placeholder="Ex.: Regulamento interno"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rag-embed-file">Arquivo</Label>
            <Input
              id="rag-embed-file"
              ref={fileRef}
              type="file"
              accept=".txt,.md,.markdown,.text,.csv,.log,text/plain,text/markdown"
              disabled={uploadEmbedMutation.isPending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setEmbedMsg(null);
                uploadEmbedMutation.mutate(file);
              }}
            />
          </div>
          {embedMsg && <p className="text-sm text-muted-foreground">{embedMsg}</p>}
          {uploadEmbedMutation.isPending && (
            <p className="text-xs text-muted-foreground">Indexando…</p>
          )}
          <ul className="space-y-2">
            {(embedsQuery.data?.embeds ?? []).map((embed) => (
              <li
                key={embed.id}
                className="flex items-start justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{embed.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {embed.filename ?? "texto"} · {embed.chunkCount} chunk
                    {embed.chunkCount === 1 ? "" : "s"} ·{" "}
                    {embed.bodyChars.toLocaleString("pt-BR")} chars
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 px-2"
                  disabled={deleteEmbedMutation.isPending}
                  aria-label={`Remover ${embed.title}`}
                  onClick={() => {
                    if (window.confirm(`Remover "${embed.title}" do índice?`)) {
                      deleteEmbedMutation.mutate(embed.id);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
            {embedsQuery.isSuccess && (embedsQuery.data?.embeds.length ?? 0) === 0 && (
              <li className="text-xs text-muted-foreground">Nenhum embed externo ainda.</li>
            )}
          </ul>
        </section>
      )}

      {status && (
        <section className={`space-y-3 ${isAdmin ? "border-t pt-4" : ""}`}>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <RefreshCw className="h-4 w-4" />
            Índice RAG
          </h3>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Documentos</dt>
              <dd className="font-medium tabular-nums">{status.documents ?? 0}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Chunks</dt>
              <dd className="font-medium tabular-nums">{status.chunks ?? 0}</dd>
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
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={
                reindexMutation.isPending || status.reindexRunning || !status.openaiConfigured
              }
              onClick={() => reindexMutation.mutate(false)}
            >
              <RefreshCw
                className={`mr-1.5 h-3.5 w-3.5 ${reindexMutation.isPending ? "animate-spin" : ""}`}
              />
              {reindexMutation.isPending ? "Reindexando…" : "Reindexar"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={
                reindexMutation.isPending || status.reindexRunning || !status.openaiConfigured
              }
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
          {reindexMutation.isError && (
            <p className="text-xs text-destructive">
              {reindexMutation.error instanceof Error
                ? reindexMutation.error.message
                : "Falha ao reindexar."}
            </p>
          )}
        </section>
      )}

      {statusQuery.isLoading && !status && (
        <p className="text-sm text-muted-foreground">Carregando status do índice…</p>
      )}
    </div>
  );
}
