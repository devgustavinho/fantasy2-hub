import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GroupInviteActions } from "@/components/GroupInviteActions";
import { QueryError } from "@/components/QueryError";
import { useAuth } from "@/contexts/AuthContext";
import {
  isPortalWelcomeDone,
  readWelcomeProgress,
  writeWelcomeProgress,
  type WelcomeProgress,
  type WelcomeStepId,
} from "@/lib/welcomeProgress";
import type { GroupLinksForUser } from "@/lib/types";
import * as groupLinksService from "@/services/groupLinks";

type PortalStep = "general" | "tower" | "hub";

function initialStep(progress: WelcomeProgress): PortalStep {
  if (!progress.general) return "general";
  if (!progress.tutorial) return "tower";
  return "hub";
}

type PortalWelcomeProps = {
  preview?: boolean;
  mockLinks?: GroupLinksForUser;
  /** Simulador admin: progresso controlado pelo pai. */
  controlledProgress?: WelcomeProgress;
  onControlledProgressChange?: (next: WelcomeProgress) => void;
  /** Simulador: ao clicar “Ir para o início”, entrega o progresso final. */
  onPreviewFinished?: (progress: WelcomeProgress) => void;
};

export default function PortalWelcome({
  preview = false,
  mockLinks,
  controlledProgress,
  onControlledProgressChange,
  onPreviewFinished,
}: PortalWelcomeProps = {}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const userId = preview ? "preview" : (user?.id ?? "anon");
  const controlled = preview && controlledProgress != null;

  const [localProgress, setLocalProgress] = useState<WelcomeProgress>(() =>
    preview ? (controlledProgress ?? {}) : readWelcomeProgress(userId),
  );
  const progress = controlled ? controlledProgress! : localProgress;
  const [step, setStep] = useState<PortalStep>(() =>
    preview ? initialStep(controlledProgress ?? {}) : initialStep(readWelcomeProgress(userId)),
  );

  const resolvedLinks =
    mockLinks ??
    ({
      generalUrl: "https://chat.whatsapp.com/preview-grupo-geral",
      tower: 3,
      towerUrl: "https://chat.whatsapp.com/preview-torre-3",
    } satisfies GroupLinksForUser);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: preview
      ? ["group-links", "preview", resolvedLinks.tower, resolvedLinks.generalUrl, resolvedLinks.towerUrl]
      : ["group-links"],
    queryFn: () =>
      preview ? Promise.resolve(resolvedLinks) : groupLinksService.getGroupLinks(),
  });

  function persist(next: WelcomeProgress) {
    if (controlled) onControlledProgressChange?.(next);
    else setLocalProgress(next);
    if (!preview) writeWelcomeProgress(userId, next);
  }

  function mark(stepId: WelcomeStepId, extra?: Partial<WelcomeProgress>) {
    persist({ ...progress, [stepId]: true, ...extra });
  }

  function finishWizard() {
    const next = { ...progress, tutorial: true };
    persist(next);
    if (!preview) navigate("/", { replace: true });
    else if (onPreviewFinished) onPreviewFinished(next);
    else setStep("hub");
  }

  function onGeneralOpen() {
    mark("general");
    setStep("tower");
  }

  function onGeneralNext() {
    mark("general");
    setStep("tower");
  }

  function onTowerOpen() {
    mark("tower");
  }

  function onTowerNext() {
    // Próximo libera o Hub sem marcar a torre — o nudge na Home cobre quem ainda não entrou.
    setStep("hub");
  }

  if (!preview && isPortalWelcomeDone(progress)) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-8">
      <div className="space-y-2 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MessageCircle className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-semibold">Bem-vindo ao Fantasy 2</h1>
        <p className="text-sm text-muted-foreground">
          Entre nos grupos do WhatsApp e depois explore o Hub no seu ritmo.
        </p>
      </div>

      <div className="flex justify-center gap-2" aria-hidden>
        {(["general", "tower", "hub"] as PortalStep[]).map((id, index) => (
          <span
            key={id}
            className={
              step === id
                ? "h-2 w-6 rounded-full bg-primary"
                : progress[
                      id === "hub" ? "tutorial" : id
                    ]
                  ? "h-2 w-2 rounded-full bg-primary/60"
                  : "h-2 w-2 rounded-full bg-muted-foreground/30"
            }
            title={`Etapa ${index + 1}`}
          />
        ))}
      </div>

      {isLoading && <p className="text-center text-sm text-muted-foreground">Carregando links...</p>}
      {isError && <QueryError onRetry={() => refetch()} />}

      {step === "general" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Grupo geral Fantasy 2</CardTitle>
            <CardDescription>
              Entre no WhatsApp do condomínio para avisos e conversa com a vizinhança.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <GroupInviteActions
              url={data?.generalUrl ?? null}
              missingLabel="A administração ainda não configurou o link do grupo geral."
              onOpen={onGeneralOpen}
            />
            <Button type="button" className="w-full" onClick={onGeneralNext}>
              Próximo
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "tower" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Grupo da sua torre</CardTitle>
            <CardDescription>
              Cada torre tem um grupo próprio — use o link da torre do seu apartamento.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data?.tower != null ? (
              <p className="text-sm text-muted-foreground">Convite da Torre {data.tower}:</p>
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
              onOpen={onTowerOpen}
            />
            <Button type="button" className="w-full" onClick={onTowerNext}>
              Próximo
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "hub" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Conheça o Hub</CardTitle>
            <CardDescription>
              A página inicial e o restante do app estão liberados — explore no seu ritmo. Os links
              dos grupos continuam no FAQ se precisar depois.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" className="w-full" onClick={finishWizard}>
              Ir para o início
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
