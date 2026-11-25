import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileUp, KeyRound, RefreshCw, SendHorizontal, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useAuth } from "@/contexts/AuthContext";
import * as ragService from "@/services/rag";
import type { RagCitation } from "@/services/rag";

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

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  citations?: RagCitation[];
  pending?: boolean;
  error?: boolean;
  at: number;
};

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const WELCOME: ChatMessage = {
  id: "welcome",
  role: "system",
  text: "Olá! Pergunte sobre regras, horários, serviços e recomendações do Fantasy 2. Eu só respondo com base no material do condomínio.",
  at: Date.now(),
};

export default function AskCondo() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isStaff = user?.role === "admin" || user?.role === "sindico";
  const isAdmin = user?.role === "admin";
  const showAdvanced = isStaff || isAdmin;

  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [draft, setDraft] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [provider, setProvider] = useState<"openai">("openai");
  const [apiKey, setApiKey] = useState("");
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);
  const [embedTitle, setEmbedTitle] = useState("");
  const [embedMsg, setEmbedMsg] = useState<string | null>(null);

  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const statusQuery = useQuery({
    queryKey: ["rag-status"],
    queryFn: ragService.getRagStatus,
  });

  const settingsQuery = useQuery({
    queryKey: ["rag-settings"],
    queryFn: ragService.getRagSettings,
    enabled: isAdmin && advancedOpen,
  });

  const embedsQuery = useQuery({
    queryKey: ["rag-embeds"],
    queryFn: ragService.listRagEmbeds,
    enabled: isAdmin && advancedOpen,
  });

  const askMutation = useMutation({
    mutationFn: (q: string) => ragService.askCondo(q),
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

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function sendQuestion(raw: string) {
    const q = raw.trim();
    if (q.length < 3 || askMutation.isPending) return;

    const userMsg: ChatMessage = { id: newId(), role: "user", text: q, at: Date.now() };
    const pendingId = newId();
    const pending: ChatMessage = {
      id: pendingId,
      role: "assistant",
      text: "Digitando…",
      pending: true,
      at: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg, pending]);
    setDraft("");

    try {
      const result = await askMutation.mutateAsync(q);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingId
            ? {
                id: pendingId,
                role: "assistant",
                text: result.answer,
                citations: result.citations,
                at: Date.now(),
              }
            : m,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível responder.";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingId
            ? { id: pendingId, role: "assistant", text: message, error: true, at: Date.now() }
            : m,
        ),
      );
    } finally {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void sendQuestion(draft);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendQuestion(draft);
    }
  }

  function handleSaveSettings(e: FormEvent) {
    e.preventDefault();
    setSettingsMsg(null);
    saveSettingsMutation.mutate();
  }

  const status = statusQuery.data;
  const settings = settingsQuery.data ?? status?.settings;
  const unavailableHint =
    status && !status.openaiConfigured
      ? isAdmin
        ? "Configure o provedor em Avançado para ativar o chat."
        : "O assistente ainda não está configurado. Peça ao administrador."
      : status && status.openaiConfigured && (status.chunks ?? 0) === 0
        ? "O índice ainda está vazio — staff pode reindexar em Avançado."
        : null;

  return (
    <div
      className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col pb-[4.75rem]"
      style={{ minHeight: "calc(100dvh - 5.5rem)" }}
    >
      {/* Cabeçalho fino — estilo conversa */}
      <div className="flex items-center justify-between gap-2 border-b border-brand-navy/10 bg-brand-navy px-4 py-2.5 text-white">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-wide">Fantasy 2</p>
          <p className="truncate text-xs text-white/70">Assistente do condomínio</p>
        </div>
        {showAdvanced && (
          <button
            type="button"
            onClick={() => setAdvancedOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/90 hover:bg-white/10"
            aria-label="Avançado"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Avançado
          </button>
        )}
      </div>

      {/* Thread */}
      <div
        ref={threadRef}
        className="flex-1 space-y-3 overflow-y-auto px-3 py-4"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(15, 42, 68, 0.07) 1px, transparent 0)",
          backgroundSize: "18px 18px",
        }}
      >
        {unavailableHint && (
          <p className="mx-auto max-w-[90%] rounded-lg bg-amber-50 px-3 py-2 text-center text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            {unavailableHint}
          </p>
        )}

        {messages.map((m) => {
          if (m.role === "system") {
            return (
              <div key={m.id} className="flex justify-center">
                <p className="max-w-[85%] rounded-lg bg-black/5 px-3 py-1.5 text-center text-xs text-muted-foreground dark:bg-white/10">
                  {m.text}
                </p>
              </div>
            );
          }

          const mine = m.role === "user";
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                  mine
                    ? "rounded-br-md bg-brand-navy text-white"
                    : m.error
                      ? "rounded-bl-md border border-destructive/30 bg-destructive/10 text-destructive"
                      : "rounded-bl-md bg-white text-foreground dark:bg-zinc-900"
                } ${m.pending ? "opacity-70 italic" : ""}`}
              >
                <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                {m.citations && m.citations.length > 0 && (
                  <div className={`mt-2 space-y-1 border-t pt-2 text-[11px] ${mine ? "border-white/20 text-white/80" : "border-border/60 text-muted-foreground"}`}>
                    <p className="font-medium uppercase tracking-wide opacity-80">Fontes</p>
                    {m.citations.map((c) => (
                      <p key={`${c.sourceType}-${c.sourceId}`} className="line-clamp-2">
                        {SOURCE_LABEL[c.sourceType] ?? c.sourceType}: {c.title}
                      </p>
                    ))}
                  </div>
                )}
                <p className={`mt-1 text-[10px] tabular-nums ${mine ? "text-white/55" : "text-muted-foreground"}`}>
                  {new Date(m.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer — colado embaixo, acima do dock */}
      {/* Composer acima do dock sticky do AppLayout (~h-14 + bottom-4). */}
      <form
        onSubmit={handleSubmit}
        className="sticky bottom-[4.75rem] z-20 shrink-0 border-t bg-background/95 px-3 py-2 backdrop-blur"
      >
        <div className="flex items-end gap-2 rounded-2xl border bg-muted/40 px-2 py-1.5">
          <textarea
            ref={inputRef}
            rows={1}
            maxLength={500}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Mensagem"
            className="max-h-28 min-h-[2.25rem] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
            aria-label="Mensagem"
          />
          <Button
            type="submit"
            size="sm"
            className="h-9 w-9 shrink-0 rounded-full p-0"
            disabled={askMutation.isPending || draft.trim().length < 3}
            aria-label="Enviar"
          >
            <SendHorizontal className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-1 px-1 text-[10px] text-muted-foreground">Enter envia · Shift+Enter quebra linha</p>
      </form>

      {showAdvanced && (
        <BottomSheet
          open={advancedOpen}
          onClose={() => setAdvancedOpen(false)}
          title="Avançado"
          description="Configuração e índice — fora da conversa."
          className="sm:max-w-lg"
        >
          <div className="space-y-6 overflow-y-auto px-4 py-4">
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

            {isStaff && status && (
              <section className="space-y-3 border-t pt-4">
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
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
