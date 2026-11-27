import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Eye, Fingerprint, Home, Smartphone, Bell } from "lucide-react";
import { OnboardingBanner, type OnboardingSuggestion } from "@/components/OnboardingBanner";
import { TowerGroupNudge } from "@/components/TowerGroupNudge";
import { WelcomeSteps } from "@/components/WelcomeSteps";
import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import PortalWelcome from "@/pages/PortalWelcome";

type PreviewTab = "onboarding" | "boas-vindas";

const SUGGESTIONS: { id: OnboardingSuggestion; label: string; icon: typeof Fingerprint }[] = [
  { id: "passkey", label: "Passkey", icon: Fingerprint },
  { id: "install", label: "Instalar app", icon: Smartphone },
  { id: "push", label: "Notificações", icon: Bell },
];

const MOCK_WELCOME = {
  title: "Bem-vindo ao Fantasy 2",
  body: `Olá! Esta é uma **prévia mockada** da página pública de boas-vindas (QR do elevador).

## O que você encontra aqui

- Regras de convivência
- Horários das áreas comuns
- Orientações para mudanças

Nenhum texto desta tela altera a página real. Para editar o conteúdo publicado, use o botão abaixo.`,
};

function tabFromHash(hash: string): PreviewTab {
  return hash.replace(/^#/, "") === "boas-vindas" ? "boas-vindas" : "onboarding";
}

export default function OnboardingPreview() {
  const location = useLocation();
  const [tab, setTab] = useState<PreviewTab>(() => tabFromHash(location.hash));
  const [suggestion, setSuggestion] = useState<OnboardingSuggestion>("passkey");

  useEffect(() => {
    setTab(tabFromHash(location.hash));
  }, [location.hash]);

  function selectTab(next: PreviewTab) {
    setTab(next);
    const hash = next === "boas-vindas" ? "#boas-vindas" : "#onboarding";
    if (location.hash !== hash) {
      window.history.replaceState(null, "", `${location.pathname}${hash}`);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Eye className="h-3.5 w-3.5" />
            Preview · só admin
          </p>
          <h1 className="text-2xl font-semibold">Preview de onboarding</h1>
          <p className="text-sm text-muted-foreground">
            Como um morador novo vê o banner e a página de boas-vindas — dados mockados, sem
            efeitos na conta real.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/configuracoes">← Configurações</Link>
        </Button>
      </div>

      <div className="flex gap-2 rounded-xl border bg-muted/40 p-1">
        <button
          type="button"
          onClick={() => selectTab("onboarding")}
          className={cn(
            "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            tab === "onboarding" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          Ver onboarding
        </button>
        <button
          type="button"
          onClick={() => selectTab("boas-vindas")}
          className={cn(
            "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            tab === "boas-vindas" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          Preview boas-vindas
        </button>
      </div>

      {tab === "onboarding" && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Banner do celular</CardTitle>
              <CardDescription>
                No app real aparece só uma sugestão por vez (passkey → instalar → push). Aqui você
                escolhe qual ver. Botões não cadastram passkey, não instalam e não ativam push.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    size="sm"
                    variant={suggestion === item.id ? "default" : "outline"}
                    onClick={() => setSuggestion(item.id)}
                  >
                    <item.icon className="h-3.5 w-3.5" />
                    {item.label}
                  </Button>
                ))}
              </div>
              <div className="mx-auto max-w-sm rounded-2xl border bg-background p-2 shadow-sm">
                <p className="mb-2 px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Largura de celular
                </p>
                <OnboardingBanner preview previewSuggestion={suggestion} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Wizard do Portal</CardTitle>
              <CardDescription>
                Fluxo de primeiro acesso (geral → torre → Hub). Progresso só nesta sessão de
                preview.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mx-auto max-w-sm rounded-2xl border bg-background shadow-sm">
                <PortalWelcome preview />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Nudge da torre (Home)</CardTitle>
              <CardDescription>
                Aparece na próxima visita à Home se a torre ainda não foi concluída.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mx-auto max-w-sm">
                <TowerGroupNudge preview forceShow />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Primeiros passos (FAQ)</CardTitle>
              <CardDescription>
                Bloco permanente do FAQ com links recuperáveis (torre 3 mockada).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WelcomeSteps preview />
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "boas-vindas" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Layout da página pública do QR do elevador, com texto de exemplo. Conteúdo real:{" "}
            <Link to="/boas-vindas" className="underline underline-offset-2">
              /boas-vindas
            </Link>
            .
          </p>
          <div className="overflow-hidden rounded-2xl border shadow-sm">
            <header className="bg-brand-navy px-4 py-6 text-white">
              <div className="mx-auto flex max-w-2xl items-center gap-4">
                <img src="/logo.png" alt="" className="h-14 w-14 rounded-full object-cover" />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-brand-gold">
                    Fantasy 2
                  </p>
                  <h2 className="text-2xl font-bold leading-tight">{MOCK_WELCOME.title}</h2>
                </div>
              </div>
            </header>
            <div className="bg-muted/40 px-4 py-6">
              <article className="mx-auto max-w-2xl rounded-2xl border bg-card p-5 shadow-sm">
                <Markdown size="lg">{MOCK_WELCOME.body}</Markdown>
              </article>
              <footer className="mx-auto mt-8 flex max-w-2xl flex-col items-center gap-2 pb-4 text-center text-sm text-muted-foreground">
                <span className="font-medium text-primary">Área do morador</span>
                <span className="inline-flex items-center gap-1 text-xs">
                  <Home className="h-3 w-3" />
                  Preview — links da página real não foram alterados
                </span>
              </footer>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/boas-vindas">Editar página publicada</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
