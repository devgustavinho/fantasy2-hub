import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Check,
  Eye,
  Home,
  MessageCircle,
  RotateCcw,
  Smartphone,
} from "lucide-react";
import { TowerGroupNudge } from "@/components/TowerGroupNudge";
import { WelcomeSteps } from "@/components/WelcomeSteps";
import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  shouldShowTowerNudge,
  type WelcomeProgress,
} from "@/lib/welcomeProgress";
import type { GroupLinksForUser } from "@/lib/types";
import PortalWelcome from "@/pages/PortalWelcome";

type PreviewTab = "simulador" | "boas-vindas";
type SimScene = "wizard" | "home-first" | "home-return";

const MOCK_WELCOME = {
  title: "Bem-vindo ao Fantasy 2",
  body: `Olá! Esta é uma **prévia mockada** da página pública de boas-vindas (QR do elevador).

## O que você encontra aqui

- Regras de convivência
- Áreas comuns e horários
- Orientações para mudanças

Nenhum texto desta tela altera a página real. Para editar o conteúdo publicado, use o botão abaixo.`,
};

const SCENE_COPY: Record<SimScene, { title: string; hint: string }> = {
  wizard: {
    title: "Wizard do Portal",
    hint: "Mesmo fluxo de /primeiros-passos: geral → torre → Conheça o Hub. Abrir o convite do geral marca a etapa; na torre, Próximo não marca (o nudge cobre depois).",
  },
  "home-first": {
    title: "Home · 1ª visita",
    hint: "Depois de “Ir para o início”, a primeira visita à Home só registra a visita — o nudge da torre ainda não aparece.",
  },
  "home-return": {
    title: "Home · visita seguinte",
    hint: "Se a torre ainda não foi concluída, aparece o lembrete. Clicar no convite ou Ignorar marca a torre como feita.",
  },
};

function tabFromHash(hash: string): PreviewTab {
  const id = hash.replace(/^#/, "");
  if (id === "boas-vindas") return "boas-vindas";
  return "simulador";
}

function ProgressChips({ progress }: { progress: WelcomeProgress }) {
  const items: { key: keyof WelcomeProgress; label: string }[] = [
    { key: "general", label: "Geral" },
    { key: "tower", label: "Torre" },
    { key: "tutorial", label: "Hub" },
    { key: "homeSeenAfterWizard", label: "Home vista" },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => {
        const done = Boolean(progress[item.key]);
        return (
          <span
            key={item.key}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
              done
                ? "bg-primary/15 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            {done && <Check className="h-3 w-3" />}
            {item.label}
          </span>
        );
      })}
    </div>
  );
}

function PhoneChrome({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[360px]">
      <div className="overflow-hidden rounded-[1.75rem] border-2 border-foreground/15 bg-background shadow-lg">
        <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="max-h-[min(70vh,640px)] overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
    </div>
  );
}

function MockHomeShell({
  visitLabel,
  children,
}: {
  visitLabel: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-4 p-4">
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {visitLabel}
        </p>
        <h2 className="text-lg font-semibold">Início</h2>
        <p className="text-sm text-muted-foreground">Resumo do condomínio (mock).</p>
      </div>
      {children}
      <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
        Cards da Home ficam aqui no app real — só o nudge de torre importa nesta simulação.
      </div>
    </div>
  );
}

export default function OnboardingPreview() {
  const location = useLocation();
  const [tab, setTab] = useState<PreviewTab>(() => tabFromHash(location.hash));

  const [tower, setTower] = useState(3);
  const [generalConfigured, setGeneralConfigured] = useState(true);
  const [towerConfigured, setTowerConfigured] = useState(true);
  const [scene, setScene] = useState<SimScene>("wizard");
  const [progress, setProgress] = useState<WelcomeProgress>({});
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    setTab(tabFromHash(location.hash));
  }, [location.hash]);

  const mockLinks = useMemo<GroupLinksForUser>(
    () => ({
      generalUrl: generalConfigured
        ? "https://chat.whatsapp.com/preview-grupo-geral"
        : null,
      tower,
      towerUrl: towerConfigured
        ? `https://chat.whatsapp.com/preview-torre-${tower}`
        : null,
    }),
    [tower, generalConfigured, towerConfigured],
  );

  function selectTab(next: PreviewTab) {
    setTab(next);
    const hash = next === "boas-vindas" ? "#boas-vindas" : "#simulador";
    if (location.hash !== hash) {
      window.history.replaceState(null, "", `${location.pathname}${hash}`);
    }
  }

  function resetSimulation() {
    setProgress({});
    setScene("wizard");
    setRunId((n) => n + 1);
  }

  function finishWizard(next: WelcomeProgress) {
    setProgress(next);
    setScene("home-first");
  }

  function goToReturnVisit() {
    const next = { ...progress, homeSeenAfterWizard: true };
    setProgress(next);
    setScene("home-return");
    setRunId((n) => n + 1);
  }

  const nudgeWouldShow = shouldShowTowerNudge({
    ...progress,
    homeSeenAfterWizard: true,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Eye className="h-3.5 w-3.5" />
            Simulador · só admin
          </p>
          <h1 className="text-2xl font-semibold">Simulador de onboarding</h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            Percorra o mesmo fluxo de WhatsApp que o morador novo vê no Portal — dados mockados,
            sem gravar na sua conta.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/configuracoes">← Configurações</Link>
        </Button>
      </div>

      <div className="flex gap-2 rounded-xl border bg-muted/40 p-1">
        <button
          type="button"
          onClick={() => selectTab("simulador")}
          className={cn(
            "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            tab === "simulador"
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Fluxo do Portal
        </button>
        <button
          type="button"
          onClick={() => selectTab("boas-vindas")}
          className={cn(
            "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            tab === "boas-vindas"
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Página pública (QR)
        </button>
      </div>

      {tab === "simulador" && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Controles mock</CardTitle>
                <CardDescription>
                  Torre e links como o admin configura em Boas-vindas. URL vazia mostra o aviso real.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Torre do apartamento</p>
                  <div className="flex flex-wrap gap-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Button
                        key={n}
                        type="button"
                        size="sm"
                        variant={tower === n ? "default" : "outline"}
                        onClick={() => setTower(n)}
                      >
                        Torre {n}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={generalConfigured ? "default" : "outline"}
                    onClick={() => setGeneralConfigured((v) => !v)}
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Geral {generalConfigured ? "configurado" : "vazio"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={towerConfigured ? "default" : "outline"}
                    onClick={() => setTowerConfigured((v) => !v)}
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Torre {towerConfigured ? "configurada" : "vazia"}
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                  <Button type="button" size="sm" variant="outline" onClick={resetSimulation}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reiniciar do zero
                  </Button>
                  <ProgressChips progress={progress} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{SCENE_COPY[scene].title}</CardTitle>
                <CardDescription>{SCENE_COPY[scene].hint}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["wizard", "1. Wizard"],
                      ["home-first", "2. Home 1ª"],
                      ["home-return", "3. Home nudge"],
                    ] as const
                  ).map(([id, label]) => (
                    <Button
                      key={id}
                      type="button"
                      size="sm"
                      variant={scene === id ? "default" : "outline"}
                      onClick={() => {
                        if (id === "wizard") {
                          resetSimulation();
                          return;
                        }
                        if (id === "home-first") {
                          setProgress((p) => ({ ...p, general: true, tutorial: true }));
                          setScene("home-first");
                          setRunId((n) => n + 1);
                          return;
                        }
                        setProgress((p) => ({
                          ...p,
                          general: true,
                          tutorial: true,
                          homeSeenAfterWizard: true,
                        }));
                        setScene("home-return");
                        setRunId((n) => n + 1);
                      }}
                    >
                      {label}
                    </Button>
                  ))}
                </div>

                {scene === "home-first" && (
                  <Button type="button" className="w-full sm:w-auto" onClick={goToReturnVisit}>
                    Simular próxima visita à Home
                  </Button>
                )}

                {scene === "home-return" && !nudgeWouldShow && (
                  <p className="text-sm text-muted-foreground">
                    Nudge não aparece: a torre já está concluída (ou o Hub ainda não foi liberado).
                  </p>
                )}
              </CardContent>
            </Card>

            <details className="rounded-xl border bg-card">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                Depois: links recuperáveis no FAQ
              </summary>
              <div className="border-t px-4 py-4">
                <WelcomeSteps preview mockLinks={mockLinks} />
              </div>
            </details>
          </div>

          <div className="lg:sticky lg:top-4">
            <PhoneChrome
              label={
                scene === "wizard"
                  ? "/primeiros-passos"
                  : scene === "home-first"
                    ? "/ · 1ª visita"
                    : "/ · visita seguinte"
              }
            >
              {scene === "wizard" && (
                <PortalWelcome
                  key={`wizard-${runId}-${tower}-${generalConfigured}-${towerConfigured}`}
                  preview
                  mockLinks={mockLinks}
                  controlledProgress={progress}
                  onControlledProgressChange={setProgress}
                  onPreviewFinished={finishWizard}
                />
              )}

              {scene === "home-first" && (
                <MockHomeShell visitLabel="Primeira visita após o wizard">
                  <p className="rounded-lg border border-dashed border-muted-foreground/40 bg-muted/20 p-3 text-sm text-muted-foreground">
                    Sem nudge nesta visita — só marca que a Home já foi vista.
                  </p>
                </MockHomeShell>
              )}

              {scene === "home-return" && (
                <MockHomeShell visitLabel="Visita seguinte à Home">
                  {nudgeWouldShow ? (
                    <TowerGroupNudge
                      key={`nudge-${runId}`}
                      preview
                      forceShow
                      mockLinks={mockLinks}
                      controlledProgress={progress}
                      onControlledProgressChange={setProgress}
                    />
                  ) : (
                    <p className="rounded-lg border border-dashed border-muted-foreground/40 bg-muted/20 p-3 text-sm text-muted-foreground">
                      Torre já concluída — nenhum lembrete.
                    </p>
                  )}
                </MockHomeShell>
              )}
            </PhoneChrome>
          </div>
        </div>
      )}

      {tab === "boas-vindas" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Layout da página pública do QR do elevador (separada do onboarding do Portal). Conteúdo
            real:{" "}
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
