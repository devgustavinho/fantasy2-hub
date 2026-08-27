// Captura o evento `beforeinstallprompt` (Android/Chrome) assim que ele disparar, guarda pra
// usar depois — o navegador só permite chamar `.prompt()` uma vez por evento, então precisa
// ficar guardado até o usuário clicar em "Instalar" (que pode ser bem depois do carregamento
// da página). iOS Safari não dispara esse evento — lá a instalação é sempre manual
// (Compartilhar > Adicionar à Tela de Início), não tem o que capturar.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
  });
}

export function hasNativeInstallPrompt() {
  return deferredPrompt !== null;
}

export async function triggerNativeInstallPrompt() {
  if (!deferredPrompt) return false;
  const prompt = deferredPrompt;
  deferredPrompt = null;
  prompt.prompt();
  const choice = await prompt.userChoice;
  return choice.outcome === "accepted";
}

export function isRunningStandalone() {
  if (typeof window === "undefined") return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}
