import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  ChevronRight,
  Clock,
  Eye,
  HelpCircle,
  Home,
  KeyRound,
  MessageCircleQuestion,
  Plug,
  Settings2,
  Tag,
} from "lucide-react";
import { RagAdminPanel } from "@/components/RagAdminPanel";
import { QueryError } from "@/components/QueryError";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { getWahaHealth } from "@/services/waha";
import type { ReactNode } from "react";

type SettingsLink = {
  title: string;
  description: string;
  href: string;
  icon: ReactNode;
  adminOnly?: boolean;
};

function SettingsLinkRow({ item }: { item: SettingsLink }) {
  return (
    <Link
      to={item.href}
      className="flex items-center gap-3 rounded-xl border bg-card px-3 py-3 text-left transition-colors hover:bg-muted/60"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-navy/90 text-white">
        {item.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{item.title}</span>
        <span className="block text-xs text-muted-foreground">{item.description}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export default function SystemSettings() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isStaff = user?.role === "admin" || user?.role === "sindico";

  const wahaQuery = useQuery({
    queryKey: ["waha-health"],
    queryFn: getWahaHealth,
    enabled: isAdmin,
    retry: false,
  });

  const contentLinks: SettingsLink[] = [
    ...(isAdmin
      ? [
          {
            title: "Boas-vindas",
            description: "Texto do QR do elevador, grupos WhatsApp e cartaz",
            href: "/admin/boas-vindas",
            icon: <Home className="h-5 w-5" />,
            adminOnly: true,
          },
          {
            title: "Simulador de onboarding",
            description: "Percorra o fluxo WhatsApp do Portal (geral → torre → Hub + nudge)",
            href: "/admin/preview-onboarding#simulador",
            icon: <Eye className="h-5 w-5" />,
            adminOnly: true,
          },
          {
            title: "Preview boas-vindas",
            description: "Como fica a página do QR do elevador (dados fictícios)",
            href: "/admin/preview-onboarding#boas-vindas",
            icon: <Eye className="h-5 w-5" />,
            adminOnly: true,
          },
        ]
      : []),
    {
      title: "FAQ",
      description: "Perguntas frequentes (edição na própria página)",
      href: "/faq",
      icon: <HelpCircle className="h-5 w-5" />,
    },
    {
      title: "Horários",
      description: "Áreas comuns, silêncio, mudanças e Wi‑Fi",
      href: "/horarios",
      icon: <Clock className="h-5 w-5" />,
    },
  ];

  const catalogLinks: SettingsLink[] = isAdmin
    ? [
        {
          title: "Tags de serviços",
          description: "Taxonomia do catálogo de negócios",
          href: "/admin/tags",
          icon: <Tag className="h-5 w-5" />,
          adminOnly: true,
        },
      ]
    : [];

  const waha = wahaQuery.data;

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8">
      <div className="space-y-1">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Settings2 className="h-3.5 w-3.5" />
          Administração
        </p>
        <h1 className="text-2xl font-semibold">Configurações do sistema</h1>
        <p className="text-sm text-muted-foreground">
          Tudo que define como o Hub se comporta e o que o morador lê como regra ou conteúdo fixo —
          num só lugar.
        </p>
      </div>

      <Section title="Conteúdo" description="Textos e regras visíveis aos moradores.">
        {contentLinks.map((item) => (
          <SettingsLinkRow key={item.href} item={item} />
        ))}
      </Section>

      {isStaff && (
        <Section
          title="Assistente"
          description="Provedor de IA, documentos indexados e reindexação."
        >
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageCircleQuestion className="h-4 w-4" />
                Índice RAG
              </CardTitle>
              <CardDescription>
                Mesmas opções do “Avançado” em Perguntar — aqui ficam fáceis de achar.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RagAdminPanel />
              <p className="mt-4 text-xs text-muted-foreground">
                Também disponível em{" "}
                <Link to="/perguntar" className="underline underline-offset-2">
                  Perguntar → Avançado
                </Link>
                .
              </p>
            </CardContent>
          </Card>
        </Section>
      )}

      {isAdmin && (
        <Section title="Integrações" description="Canais externos e acesso por agente.">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Bot className="h-4 w-4" />
                WhatsApp (WAHA)
              </CardTitle>
              <CardDescription>
                Bot do grupo Fantasy 2. Ligar/desligar e credenciais ficam no servidor (.env) —
                aqui só o status.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {wahaQuery.isLoading && (
                <p className="text-muted-foreground">Consultando health…</p>
              )}
              {wahaQuery.isError && <QueryError onRetry={() => wahaQuery.refetch()} />}
              {waha && (
                <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border px-3 py-2">
                    <dt className="text-xs text-muted-foreground">Módulo</dt>
                    <dd className="font-medium">{waha.enabled ? "ligado" : "desligado"}</dd>
                  </div>
                  <div className="rounded-lg border px-3 py-2">
                    <dt className="text-xs text-muted-foreground">Credenciais</dt>
                    <dd className="font-medium">
                      {waha.configured ? "configuradas" : "incompletas"}
                    </dd>
                  </div>
                  <div className="rounded-lg border px-3 py-2">
                    <dt className="text-xs text-muted-foreground">Sessão</dt>
                    <dd className="font-medium tabular-nums">{waha.session ?? "—"}</dd>
                  </div>
                  <div className="rounded-lg border px-3 py-2">
                    <dt className="text-xs text-muted-foreground">Grupo</dt>
                    <dd className="font-medium">
                      {waha.groupConfigured ? "apontado" : "não configurado"}
                    </dd>
                  </div>
                  <div className="rounded-lg border px-3 py-2 sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">Allowlist do resumo</dt>
                    <dd className="font-medium">
                      {waha.summaryAllowlistConfigured ? "configurada" : "vazia"}
                    </dd>
                  </div>
                </dl>
              )}
            </CardContent>
          </Card>

          <Link
            to="/perfil#avancado"
            className="flex items-center gap-3 rounded-xl border bg-card px-3 py-3 text-left transition-colors hover:bg-muted/60"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-navy/90 text-white">
              <KeyRound className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">Tokens MCP</span>
              <span className="block text-xs text-muted-foreground">
                Conectar Cursor, Claude ou Antigravity — no Perfil → Avançado
              </span>
            </span>
            <Plug className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        </Section>
      )}

      {catalogLinks.length > 0 && (
        <Section title="Catálogo" description="Classificação dos negócios dos moradores.">
          {catalogLinks.map((item) => (
            <SettingsLinkRow key={item.href} item={item} />
          ))}
        </Section>
      )}
    </div>
  );
}
