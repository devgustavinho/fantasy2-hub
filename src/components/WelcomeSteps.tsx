import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GroupInviteActions } from "@/components/GroupInviteActions";
import { QueryError } from "@/components/QueryError";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  readWelcomeProgress,
  writeWelcomeProgress,
  type WelcomeProgress,
  type WelcomeStepId,
} from "@/lib/welcomeProgress";
import type { GroupLinksForUser } from "@/lib/types";
import * as groupLinksService from "@/services/groupLinks";

const STEPS: { id: WelcomeStepId; title: string; blurb: string }[] = [
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
    title: "Conheça o Hub",
    blurb: "Explore a página inicial e o app no seu ritmo — sem checklist obrigatório.",
  },
];

type WelcomeStepsProps = {
  /** Admin preview: usa links mock e não grava progresso no aparelho. */
  preview?: boolean;
  mockLinks?: GroupLinksForUser;
};

export function WelcomeSteps({ preview = false, mockLinks }: WelcomeStepsProps = {}) {
  const { user } = useAuth();
  const userId = preview ? "preview" : (user?.id ?? "anon");
  const [done, setDone] = useState<WelcomeProgress>(() => (preview ? {} : readWelcomeProgress(userId)));
  const [active, setActive] = useState<WelcomeStepId>(() => {
    if (preview) return "general";
    const progress = readWelcomeProgress(userId);
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

  function persist(next: WelcomeProgress) {
    setDone(next);
    if (!preview) writeWelcomeProgress(userId, next);
  }

  function mark(step: WelcomeStepId) {
    const next = { ...done, [step]: true };
    persist(next);
    const following = STEPS.find((s) => !next[s.id]);
    if (following) setActive(following.id);
  }

  return (
    <Card className="border-primary/25 bg-primary/[0.03]">
      <CardHeader>
        <CardTitle className="text-base">Primeiros passos</CardTitle>
        <CardDescription>
          Links dos grupos e um atalho para explorar o Hub. Pode voltar aqui quando quiser.
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
            <GroupInviteActions
              url={data?.generalUrl ?? null}
              missingLabel="A administração ainda não configurou o link do grupo geral."
              onOpen={() => mark("general")}
            />
            <Button type="button" size="sm" onClick={() => mark("general")}>
              Próximo
            </Button>
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
            <GroupInviteActions
              url={data?.towerUrl ?? null}
              missingLabel={
                data?.tower != null
                  ? `A administração ainda não configurou o link da Torre ${data.tower}.`
                  : "Sem torre vinculada."
              }
              onOpen={() => mark("tower")}
            />
            <Button type="button" size="sm" onClick={() => mark("tower")}>
              Próximo
            </Button>
          </div>
        )}

        {active === "tutorial" && (
          <div className="space-y-3 rounded-md border bg-background p-3">
            <p className="text-sm">
              O Hub está liberado — comece pela página inicial e navegue pelas abas quando quiser.
              Não há checklist obrigatório.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link to="/" onClick={() => mark("tutorial")}>
                  Ir para o início
                </Link>
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => mark("tutorial")}>
                Próximo
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-medium">Links dos grupos (sempre disponíveis)</p>
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Grupo geral</p>
              <GroupInviteActions
                url={data?.generalUrl ?? null}
                missingLabel="Link do grupo geral ainda não configurado."
              />
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">
                Grupo da torre{data?.tower != null ? ` (${data.tower})` : ""}
              </p>
              <GroupInviteActions
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
