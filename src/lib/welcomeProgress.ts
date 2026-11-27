/** Progresso local do fluxo de boas-vindas (grupos WhatsApp + Hub). */

export type WelcomeStepId = "general" | "tower" | "tutorial";

export type WelcomeProgress = Partial<Record<WelcomeStepId, boolean>> & {
  /**
   * Depois de sair do wizard, a 1ª visita à Home só marca esta flag;
   * o nudge da torre aparece nas visitas seguintes se a torre ainda não estiver feita.
   */
  homeSeenAfterWizard?: boolean;
};

export function welcomeProgressKey(userId: string) {
  return `f2hub_welcome_steps_${userId}`;
}

export function readWelcomeProgress(userId: string): WelcomeProgress {
  try {
    const raw = localStorage.getItem(welcomeProgressKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as WelcomeProgress;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeWelcomeProgress(userId: string, next: WelcomeProgress) {
  try {
    localStorage.setItem(welcomeProgressKey(userId), JSON.stringify(next));
  } catch {
    // modo privado — progresso só nesta sessão
  }
}

/** Wizard do Portal já foi concluído (etapa “Conheça o Hub” liberada). */
export function isPortalWelcomeDone(progress: WelcomeProgress): boolean {
  return Boolean(progress.tutorial);
}

/** Nudge na Home: torre pendente, wizard já passado, e já houve uma visita prévia à Home. */
export function shouldShowTowerNudge(progress: WelcomeProgress): boolean {
  return (
    Boolean(progress.tutorial) &&
    !progress.tower &&
    Boolean(progress.homeSeenAfterWizard)
  );
}

/**
 * Na 1ª Home após o wizard, grava a visita sem mostrar o nudge.
 * Retorna o progresso atualizado (ou o mesmo se nada mudou).
 */
export function noteHomeVisitAfterWizard(
  userId: string,
  progress: WelcomeProgress,
): WelcomeProgress {
  if (!progress.tutorial || progress.tower || progress.homeSeenAfterWizard) {
    return progress;
  }
  const next = { ...progress, homeSeenAfterWizard: true };
  writeWelcomeProgress(userId, next);
  return next;
}
