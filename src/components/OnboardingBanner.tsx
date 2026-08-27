import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { Bell, Fingerprint, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import * as webauthnService from "@/services/webauthn";
import * as pushService from "@/services/push";
import { hasNativeInstallPrompt, isRunningStandalone, triggerNativeInstallPrompt } from "@/lib/installPrompt";

type Suggestion = "passkey" | "install" | "push";

function dismissedKey(type: Suggestion) {
  return `f2hub_onboarding_dismissed_${type}`;
}

function isDismissed(type: Suggestion) {
  try {
    return localStorage.getItem(dismissedKey(type)) === "1";
  } catch {
    return false;
  }
}

function dismiss(type: Suggestion) {
  try {
    localStorage.setItem(dismissedKey(type), "1");
  } catch {
    // modo privado/sem storage — nada a fazer, a sugestão só volta a aparecer nessa sessão
  }
}

// Sugestões só fazem sentido no celular: passkey (login por biometria), instalar como app, e
// notificações push. Mostra só UMA por vez, na ordem passkey -> instalar -> push, avançando
// naturalmente pra próxima assim que a anterior for concluída ou dispensada.
export function OnboardingBanner() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [mobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  const supportsBiometric = browserSupportsWebAuthn();
  const pushSupported = pushService.supportsPush();
  const [, setDismissTick] = useState(0);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);

  const { data: passkeysData } = useQuery({
    queryKey: ["passkeys"],
    queryFn: webauthnService.listPasskeys,
    enabled: !!user && mobile && supportsBiometric,
  });

  const { data: pushSub } = useQuery({
    queryKey: ["push-subscription"],
    queryFn: pushService.getCurrentPushSubscription,
    enabled: !!user && mobile && pushSupported,
  });

  const registerPasskeyMutation = useMutation({
    mutationFn: () => webauthnService.registerPasskey(),
    onSuccess: () => {
      setPasskeyError(null);
      queryClient.invalidateQueries({ queryKey: ["passkeys"] });
    },
    onError: (err) => setPasskeyError(err instanceof Error ? err.message : "Erro ao cadastrar."),
  });

  const enablePushMutation = useMutation({
    mutationFn: pushService.enablePush,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["push-subscription"] }),
  });

  if (!user || !mobile) return null;

  let suggestion: Suggestion | null = null;
  if (supportsBiometric && passkeysData && passkeysData.credentials.length === 0 && !isDismissed("passkey")) {
    suggestion = "passkey";
  } else if (!isRunningStandalone() && !isDismissed("install")) {
    suggestion = "install";
  } else if (pushSupported && pushSub === null && !isDismissed("push")) {
    suggestion = "push";
  }

  if (!suggestion) return null;

  function handleDismiss() {
    dismiss(suggestion!);
    setDismissTick((v) => v + 1);
  }

  async function handleInstallClick() {
    if (hasNativeInstallPrompt()) {
      const accepted = await triggerNativeInstallPrompt();
      if (accepted) handleDismiss();
    } else {
      setShowInstallHelp((v) => !v);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 pt-4">
      <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
        {suggestion === "passkey" && <Fingerprint className="mt-0.5 h-5 w-5 shrink-0 text-primary" />}
        {suggestion === "install" && <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-primary" />}
        {suggestion === "push" && <Bell className="mt-0.5 h-5 w-5 shrink-0 text-primary" />}
        <div className="flex-1 space-y-2">
          {suggestion === "passkey" && (
            <>
              <p>Cadastre o mesmo desbloqueador do seu celular pra entrar mais rápido, sem digitar senha.</p>
              {passkeyError && <p className="text-xs text-destructive">{passkeyError}</p>}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={registerPasskeyMutation.isPending}
                  onClick={() => registerPasskeyMutation.mutate()}
                >
                  {registerPasskeyMutation.isPending ? "Cadastrando..." : "Cadastrar agora"}
                </Button>
                <Button size="sm" variant="ghost" onClick={handleDismiss}>
                  Agora não
                </Button>
              </div>
            </>
          )}
          {suggestion === "install" && (
            <>
              <p>Instale o Fantasy 2 Hub na tela inicial do seu celular pra acessar mais rápido.</p>
              {showInstallHelp && (
                <p className="text-xs text-muted-foreground">
                  No iPhone: toque em Compartilhar e depois em "Adicionar à Tela de Início". No
                  Android: toque no menu (⋮) do navegador e em "Instalar aplicativo" ou "Adicionar à
                  tela inicial".
                </p>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={handleInstallClick}>
                  Instalar
                </Button>
                <Button size="sm" variant="ghost" onClick={handleDismiss}>
                  Agora não
                </Button>
              </div>
            </>
          )}
          {suggestion === "push" && (
            <>
              <p>Ative notificações pra saber na hora quando alguém comentar ou responder numa pauta.</p>
              <div className="flex gap-2">
                <Button size="sm" disabled={enablePushMutation.isPending} onClick={() => enablePushMutation.mutate()}>
                  {enablePushMutation.isPending ? "Ativando..." : "Ativar"}
                </Button>
                <Button size="sm" variant="ghost" onClick={handleDismiss}>
                  Agora não
                </Button>
              </div>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Fechar"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
