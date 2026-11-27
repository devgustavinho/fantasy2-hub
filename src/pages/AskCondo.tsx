import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { SendHorizontal, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Markdown } from "@/components/Markdown";
import { RagAdminPanel } from "@/components/RagAdminPanel";
import { useAuth } from "@/contexts/AuthContext";
import * as ragService from "@/services/rag";
import type { RagCitation } from "@/services/rag";

const SOURCE_LABEL: Record<string, string> = {
  faq: "FAQ",
  welcome: "Boas-vindas",
  service: "Negócio",
  recommendation: "Contato",
  topic: "Pauta",
  external: "Embed",
  manual: "Manual",
  horarios: "Áreas comuns",
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
  text: "Olá! Pergunte sobre regras, horários, negócios e contatos do condomínio. Eu só respondo com base no material do Fantasy 2.",
  at: Date.now(),
};

export default function AskCondo() {
  const { user } = useAuth();
  const isStaff = user?.role === "admin" || user?.role === "sindico";
  const isAdmin = user?.role === "admin";
  const showAdvanced = isStaff || isAdmin;

  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [draft, setDraft] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const statusQuery = useQuery({
    queryKey: ["rag-status"],
    queryFn: ragService.getRagStatus,
  });

  const askMutation = useMutation({
    mutationFn: (q: string) => ragService.askCondo(q),
  });

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function sendQuestion(raw: string) {
    const q = raw.trim();
    if (q.length < 3 || askMutation.isPending) return;

    const userMsg: ChatMessage = {
      id: newId(),
      role: "user",
      text: q,
      at: Date.now(),
    };
    const pendingId = newId();
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: pendingId, role: "assistant", text: "Digitando…", pending: true, at: Date.now() },
    ]);
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

  const status = statusQuery.data;
  const unavailableHint =
    status && !status.openaiConfigured
      ? isAdmin
        ? "Configure o provedor em Avançado para ativar o chat."
        : "O assistente ainda não está configurado. Peça ao administrador."
      : status && status.openaiConfigured && (status.chunks ?? 0) === 0
        ? "O índice ainda está vazio — staff pode reindexar em Avançado."
        : null;

  return (
    <div className="relative mx-auto flex h-full min-h-0 w-full max-w-4xl flex-1 flex-col">
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
                {mine || m.error || m.pending ? (
                  <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                ) : (
                  <div className="leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0">
                    <Markdown>{m.text}</Markdown>
                  </div>
                )}
                {m.citations && m.citations.length > 0 && (
                  <div
                    className={`mt-2 space-y-1 border-t pt-2 text-[11px] ${
                      mine ? "border-white/20 text-white/80" : "border-border/60 text-muted-foreground"
                    }`}
                  >
                    <p className="font-medium uppercase tracking-wide opacity-80">Fontes</p>
                    {m.citations.map((c) => (
                      <p key={`${c.sourceType}-${c.sourceId}`} className="line-clamp-2">
                        {SOURCE_LABEL[c.sourceType] ?? c.sourceType}: {c.title}
                      </p>
                    ))}
                  </div>
                )}
                <p
                  className={`mt-1 text-[10px] tabular-nums ${
                    mine ? "text-white/55" : "text-muted-foreground"
                  }`}
                >
                  {new Date(m.at).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <form
        onSubmit={handleSubmit}
        className="z-20 shrink-0 border-t bg-background/95 px-3 py-2 backdrop-blur"
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
        <p className="mt-1 px-1 text-[10px] text-muted-foreground">
          Enter envia · Shift+Enter quebra linha
        </p>
      </form>

      {showAdvanced && (
        <BottomSheet
          open={advancedOpen}
          onClose={() => setAdvancedOpen(false)}
          title="Avançado"
          description="Configuração e índice — fora da conversa."
          className="sm:max-w-lg"
        >
          <div className="overflow-y-auto px-4 py-4">
            <RagAdminPanel enabled={advancedOpen} />
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
