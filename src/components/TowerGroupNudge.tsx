import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GroupInviteActions } from "@/components/GroupInviteActions";
import { useAuth } from "@/contexts/AuthContext";
import {
  noteHomeVisitAfterWizard,
  readWelcomeProgress,
  shouldShowTowerNudge,
  writeWelcomeProgress,
  type WelcomeProgress,
} from "@/lib/welcomeProgress";
import * as groupLinksService from "@/services/groupLinks";

type TowerGroupNudgeProps = {
  preview?: boolean;
  /** Força o nudge no preview admin. */
  forceShow?: boolean;
};

export function TowerGroupNudge({ preview = false, forceShow = false }: TowerGroupNudgeProps = {}) {
  const { user } = useAuth();
  const userId = preview ? "preview" : (user?.id ?? "anon");

  const [progress, setProgress] = useState<WelcomeProgress>(() =>
    preview
      ? forceShow
        ? { general: true, tutorial: true, homeSeenAfterWizard: true }
        : {}
      : readWelcomeProgress(userId),
  );
  // Só mostra se JÁ era elegível ao montar (visita seguinte). A 1ª Home só grava a flag.
  const [eligibleOnMount] = useState(() =>
    preview ? forceShow : shouldShowTowerNudge(readWelcomeProgress(userId)),
  );
  const [hidden, setHidden] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (preview) return;
    setProgress((current) => noteHomeVisitAfterWizard(userId, current));
  }, [preview, userId]);

  const show = (preview ? forceShow : eligibleOnMount) && !hidden;

  const { data } = useQuery({
    queryKey: preview ? ["group-links", "preview"] : ["group-links"],
    queryFn: () =>
      preview
        ? Promise.resolve({
            generalUrl: "https://chat.whatsapp.com/preview-grupo-geral",
            tower: 3,
            towerUrl: "https://chat.whatsapp.com/preview-torre-3",
          })
        : groupLinksService.getGroupLinks(),
    enabled: show,
  });

  if (!show) return null;

  function completeTower() {
    const next = { ...progress, tower: true };
    setProgress(next);
    if (!preview) writeWelcomeProgress(userId, next);
    setHidden(true);
  }

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
      <div className="flex items-start gap-3">
        <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1 space-y-2">
          {!expanded ? (
            <>
              <p>
                Você já entrou no grupo da sua torre?{" "}
                <button
                  type="button"
                  className="font-medium text-primary underline-offset-2 hover:underline"
                  onClick={() => setExpanded(true)}
                >
                  Clique aqui
                </button>
              </p>
              <Button type="button" size="sm" variant="ghost" onClick={completeTower}>
                Ignorar
              </Button>
            </>
          ) : (
            <>
              <p className="font-medium">
                Grupo da torre{data?.tower != null ? ` ${data.tower}` : ""}
              </p>
              <GroupInviteActions
                url={data?.towerUrl ?? null}
                missingLabel={
                  data?.tower != null
                    ? `Link da Torre ${data.tower} ainda não configurado.`
                    : "Sem torre vinculada à sua conta."
                }
                onOpen={completeTower}
              />
              <Button type="button" size="sm" variant="ghost" onClick={completeTower}>
                Ignorar
              </Button>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={completeTower}
          aria-label="Ignorar"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
