import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryError } from "@/components/QueryError";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import type { GroupLinksForUser } from "@/lib/types";
import * as groupLinksService from "@/services/groupLinks";

type StepId = "general" | "tower" | "tutorial";

const STEPS: { id: StepId; title: string; blurb: string }[] = [
  {
    id: "general",
    title: "Grupo geral Fantasy 2",
    blurb: "Entre no WhatsApp do condomínio para avisos e conversa com a vizinhança.",
  },
  {
    id: "tower",
    title: "Grupo da sua torre",
    blurb: "Cada torre tem um grupo próprio — use o link da torre do seu apartamento.",
  },
  {
    id: "tutorial",
    title: "Conhecer o Hub",
    blurb: "Um passeio rápido pelas funções do dia a dia (visão de morador).",
  },
];

const TUTORIAL_LINKS: { to: string; label: string; tip: string }[] = [
  { to: "/", label: "Início", tip: "Resumo de pautas e o que está aberto agora." },
  { to: "/pautas", label: "Pautas", tip: "Sugira temas, vote e comente." },
  { to: "/negocios", label: "Negócios", tip: "Serviços de moradores do Fantasy 2." },
  { to: "/recomendacoes", label: "Recomendações", tip: "Indicações da comunidade." },
  { to: "/horarios", label: "Horários", tip: "Áreas comuns, silêncio e mudanças." },
  { to: "/faq", label: "FAQ", tip: "Dúvidas frequentes — e estes primeiros passos." },
  { to: "/perguntar", label: "Perguntar", tip: "Pergunte ao conhecimento do condomínio." },
  { to: "/documentos", label: "Documentos", tip: "Manual do Proprietário e afins." },
  { to: "/perfil", label: "Perfil", tip: "Passkey, notificações e dados da conta." },
];

function progressKey(userId: string) {
  return `f2hub_welcome_steps_${userId}`;
}

function readProgress(userId: string): Partial<Record<StepId, boolean>> {
  try {
    const raw = localStorage.getItem(progressKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Record<StepId, boolean>>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeProgress(userId: string, next: Partial<Record<StepId, boolean>>) {
  try {
    localStorage.setItem(progressKey(userId), JSON.stringify(next));
  } catch {
    // modo privado — progresso só nesta sessão
  }
}

function InviteActions({
  url,
  missingLabel,
}: {
  url: string | null;
  missingLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  if (!url) {
    return <p className="text-sm text-muted-foreground">{missingLabel}</p>;
  }

  async function copy() {
    await navigator.clipboard.writeText(url!);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm">
        <a href={url} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="h-3.5 w-3.5" />
          Abrir convite
        </a>
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={copy}>
        <Copy className="h-3.5 w-3.5" />
        {copied ? "Copiado" : "Copiar link"}
      </Button>
    </div>
  );
}

type WelcomeStepsProps = {
  /** Admin preview: usa links mock e não grava progresso no aparelho. */
  preview?: boolean;
  mockLinks?: GroupLinksForUser;
};

export function WelcomeSteps({ preview = false, mockLinks }: WelcomeStepsProps = {}) {
  const { user } = useAuth();
  const userId = preview ? "preview" : (user?.id ?? "anon");
  const [done, setDone] = useState<Partial<Record<StepId, boolean>>>(() =>
    preview ? {} : readProgress(userId),
  );
  const [active, setActive] = useState<StepId>(() => {
    if (preview) return "general";
    const progress = readProgress(userId);
    return STEPS.find((s) => !progress[s.id])?.id ?? "tutorial";
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: preview ? ["group-links", "preview"] : ["group-links"],
    queryFn: () =>
      preview
        ? Promise.resolve(
            mockLinks ?? {
              generalUrl: "https://chat.whatsapp.com/preview-grupo-geral",
              tower: 3,
              towerUrl: "https://chat.whatsapp.com/preview-torre-3",
            },
          )
        : groupLinksService.getGroupLinks(),
  });

  function mark(step: StepId) {
    const next = { ...done, [step]: true };
    setDone(next);
    if (!preview) writeProgress(userId, next);
    const following = STEPS.find((s) => !next[s.id]);
    if (following) setActive(following.id);
  }

  function skip(step: StepId) {
    mark(step);
  }

  return (
    <Card className="border-primary/25 bg-primary/[0.03]">
      <CardHeader>
        <CardTitle className="text-base">Primeiros passos</CardTitle>
        <CardDescription>
          Fluxo de boas-vindas sempre disponível aqui no FAQ. Pode pular etapas e voltar quando
          quiser.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading && <p className="text-sm text-muted-foreground">Carregando links...</p>}
        {isError && <QueryError onRetry={() => refetch()} />}

        <ol className="space-y-2">
          {STEPS.map((step, index) => {
            const isActive = active === step.id;
            const isDone = Boolean(done[step.id]);
            return (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => setActive(step.id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    isActive ? "border-primary/40 bg-background" : "border-transparent hover:bg-muted/50",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                      isDone ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {isDone ? <Check className="h-3 w-3" /> : index + 1}
                  </span>
                  <span>
                    <span className="font-medium">{step.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{step.blurb}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        {active === "general" && (
          <div className="space-y-3 rounded-md border bg-background p-3">
            <p className="text-sm">Abra o convite do grupo geral do Fantasy 2:</p>
            <InviteActions
              url={data?.generalUrl ?? null}
              missingLabel="A administração ainda não configurou o link do grupo geral."
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => mark("general")} disabled={!data?.generalUrl}>
                Marcar como feito
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => skip("general")}>
                <SkipForward className="h-3.5 w-3.5" />
                Pular
              </Button>
            </div>
          </div>
        )}

        {active === "tower" && (
          <div className="space-y-3 rounded-md border bg-background p-3">
            {data?.tower != null ? (
              <p className="text-sm">Convite do grupo da Torre {data.tower}:</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Sua conta não está ligada a um apartamento — o link da torre aparece quando houver
                unidade associada.
              </p>
            )}
            <InviteActions
              url={data?.towerUrl ?? null}
              missingLabel={
                data?.tower != null
                  ? `A administração ainda não configurou o link da Torre ${data.tower}.`
                  : "Sem torre vinculada."
              }
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => mark("tower")}
                disabled={!data?.towerUrl}
              >
                Marcar como feito
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => skip("tower")}>
                <SkipForward className="h-3.5 w-3.5" />
                Pular
              </Button>
            </div>
          </div>
        )}

        {active === "tutorial" && (
          <div className="space-y-3 rounded-md border bg-background p-3">
            <p className="text-sm">Principais cantos do Hub para o morador:</p>
            <ul className="space-y-2">
              {TUTORIAL_LINKS.map((item) => (
                <li key={item.to} className="text-sm">
                  <Link to={item.to} className="font-medium text-primary underline-offset-2 hover:underline">
                    {item.label}
                  </Link>
                  <span className="text-muted-foreground"> — {item.tip}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => mark("tutorial")}>
                Marcar como feito
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => skip("tutorial")}>
                <SkipForward className="h-3.5 w-3.5" />
                Pular
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-medium">Links dos grupos (sempre disponíveis)</p>
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Grupo geral</p>
              <InviteActions
                url={data?.generalUrl ?? null}
                missingLabel="Link do grupo geral ainda não configurado."
              />
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">
                Grupo da torre{data?.tower != null ? ` (${data.tower})` : ""}
              </p>
              <InviteActions
                url={data?.towerUrl ?? null}
                missingLabel={
                  data?.tower != null
                    ? `Link da Torre ${data.tower} ainda não configurado.`
                    : "Sem torre vinculada à sua conta."
                }
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
