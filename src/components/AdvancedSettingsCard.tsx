import { useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, Copy, Eye, EyeOff, Fingerprint, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getToken } from "@/lib/api";
import { cn } from "@/lib/utils";

const PROD_API_URL = "https://api-fantasy2.gcsolutions-devs.com.br";
const PROD_APP_URL = "https://fantasy2-hub.pages.dev";
const MCP_URL = `${PROD_API_URL}/mcp`;

type ClientId = "cursor" | "claude" | "antigravity";
type CopyKind = "token" | "url" | "config";

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

function buildCursorConfig(token: string) {
  return `{
  "mcpServers": {
    "fantasy2-hub": {
      "url": "${MCP_URL}",
      "headers": {
        "Authorization": "Bearer ${token}"
      }
    }
  }
}`;
}

function buildClaudeCodeConfig(token: string) {
  return `{
  "mcpServers": {
    "fantasy2-hub": {
      "type": "http",
      "url": "${MCP_URL}",
      "headers": {
        "Authorization": "Bearer ${token}"
      }
    }
  }
}`;
}

function buildAntigravityConfig(token: string) {
  return `{
  "mcpServers": {
    "fantasy2-hub": {
      "serverUrl": "${MCP_URL}",
      "headers": {
        "Authorization": "Bearer ${token}"
      }
    }
  }
}`;
}

const CLIENTS: {
  id: ClientId;
  label: string;
  steps: ReactNode;
  configLabel: string;
  tip: ReactNode;
  build: (token: string) => string;
}[] = [
  {
    id: "cursor",
    label: "Cursor",
    steps: (
      <ol className="list-decimal space-y-2 pl-4 text-muted-foreground">
        <li>
          Abra Settings → MCP, ou edite{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">~/.cursor/mcp.json</code>.
        </li>
        <li>Cole o JSON abaixo (URL remota + JWT).</li>
        <li>Salve e reinicie o MCP / o Cursor.</li>
      </ol>
    ),
    configLabel: "Snippet Cursor (~/.cursor/mcp.json)",
    tip: (
      <>
        Alternativa:{" "}
        <code className="rounded bg-muted px-1">{"Bearer ${env:FANTASY2_TOKEN}"}</code> e exporte o
        token no ambiente do Cursor.
      </>
    ),
    build: buildCursorConfig,
  },
  {
    id: "claude",
    label: "Claude",
    steps: (
      <ol className="list-decimal space-y-2 pl-4 text-muted-foreground">
        <li>
          <strong className="font-medium text-foreground">Claude Desktop / claude.ai:</strong>{" "}
          Customize → Connectors → Add custom connector. Nome:{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">fantasy2-hub</code>. URL: a MCP
          abaixo. Em Request headers (se disponível),{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">Authorization</code> ={" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">Bearer &lt;JWT&gt;</code>.
        </li>
        <li>
          <strong className="font-medium text-foreground">Claude Code:</strong> cole o JSON em{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">.mcp.json</code> do projeto (ou use{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">claude mcp add --transport http</code>
          ).
        </li>
        <li>Confirme o JWT da sessão e reinicie / reconecte o connector.</li>
      </ol>
    ),
    configLabel: "Snippet Claude Code (.mcp.json)",
    tip: (
      <>
        No Desktop o caminho principal é o connector pela UI; o JSON serve sobretudo ao Claude Code.
      </>
    ),
    build: buildClaudeCodeConfig,
  },
  {
    id: "antigravity",
    label: "Antigravity",
    steps: (
      <ol className="list-decimal space-y-2 pl-4 text-muted-foreground">
        <li>
          No painel do agente: … → MCP Servers → Manage MCP Servers → View raw config (
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            ~/.gemini/config/mcp_config.json
          </code>{" "}
          ou{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">.agents/mcp_config.json</code>).
        </li>
        <li>
          Cole o JSON (usa <code className="rounded bg-muted px-1 py-0.5 text-xs">serverUrl</code> +
          header Bearer).
        </li>
        <li>Salve e atualize a lista de MCP instalados no Antigravity.</li>
      </ol>
    ),
    configLabel: "Snippet Antigravity (mcp_config.json)",
    tip: (
      <>
        Antigravity exige Streamable HTTP remoto — este endpoint{" "}
        <code className="rounded bg-muted px-1">/mcp</code> já é esse transporte.
      </>
    ),
    build: buildAntigravityConfig,
  },
];

type AdvancedSettingsCardProps = {
  /** Bloco de dispositivos / biometria (passkeys), renderizado dentro de Avançado. */
  devices: ReactNode;
};

export function AdvancedSettingsCard({ devices }: AdvancedSettingsCardProps) {
  const token = getToken() ?? "";
  const [open, setOpen] = useState(false);
  const [client, setClient] = useState<ClientId>("cursor");
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<CopyKind | null>(null);

  const active = CLIENTS.find((c) => c.id === client) ?? CLIENTS[0];
  const tokenForSnippet = token || "cole-o-jwt-da-sessao-aqui";
  const configSnippet = useMemo(
    () => active.build(tokenForSnippet),
    [active, tokenForSnippet],
  );

  const maskedToken = token
    ? `${token.slice(0, 12)}…${token.slice(-8)}`
    : "(faça login de novo se o token não aparecer)";

  async function handleCopy(kind: CopyKind) {
    const value = kind === "token" ? token : kind === "url" ? MCP_URL : configSnippet;
    if (!value) return;
    try {
      await copyText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-start justify-between gap-3 text-left"
        >
          <div className="space-y-1.5">
            <CardTitle className="text-base">Avançado</CardTitle>
            <CardDescription>
              Dispositivos (biometria) e conexão MCP com Claude, Cursor ou Antigravity. A maioria
              dos moradores não precisa abrir isto.
            </CardDescription>
          </div>
          <ChevronDown
            className={cn(
              "mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </CardHeader>

      {open && (
        <CardContent className="space-y-8 border-t pt-5 text-sm">
          <section className="space-y-4">
            <div className="space-y-1">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Fingerprint className="h-4 w-4 text-primary" />
                Dispositivos
              </p>
              <p className="text-muted-foreground">
                Cadastre ou remova aparelhos para login por biometria (passkey), sem digitar a senha.
              </p>
            </div>
            {devices}
          </section>

          <section className="space-y-5 border-t pt-6">
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Plug className="h-4 w-4 text-primary" />
                Conectar MCP (remoto)
              </p>
              <p className="text-muted-foreground">
                Serviço hospedado em produção — mesmas permissões do seu cargo. Não é preciso clonar
                o projeto. URL:{" "}
                <code className="break-all rounded bg-muted px-1 py-0.5 text-xs text-foreground">
                  {MCP_URL}
                </code>
              </p>
            </div>

            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Serviço remoto
                </p>
                <Button type="button" size="sm" variant="outline" onClick={() => handleCopy("url")}>
                  {copied === "url" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied === "url" ? "Copiado" : "Copiar URL"}
                </Button>
              </div>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li>
                  App:{" "}
                  <a
                    href={PROD_APP_URL}
                    className="break-all text-foreground underline-offset-2 hover:underline"
                  >
                    {PROD_APP_URL}
                  </a>
                </li>
                <li>
                  MCP:{" "}
                  <code className="break-all rounded bg-muted px-1 py-0.5 text-foreground">
                    {MCP_URL}
                  </code>
                </li>
                <li>
                  API:{" "}
                  <code className="break-all rounded bg-muted px-1 py-0.5 text-foreground">
                    {PROD_API_URL}
                  </code>
                </li>
              </ul>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Token da sessão (JWT)
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setRevealed((v) => !v)}
                    disabled={!token}
                  >
                    {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    {revealed ? "Ocultar" : "Mostrar"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleCopy("token")}
                    disabled={!token}
                  >
                    {copied === "token" ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    {copied === "token" ? "Copiado" : "Copiar token"}
                  </Button>
                </div>
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border bg-background p-3 text-xs leading-relaxed">
                {revealed && token ? token : maskedToken}
              </pre>
              <p className="text-xs text-muted-foreground">
                Equivale a estar logado. Não compartilhe nem committe. Admin: só após o 2FA.
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Cliente
              </p>
              <div className="grid grid-cols-3 gap-1.5 rounded-xl border bg-muted/40 p-1.5">
                {CLIENTS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setClient(c.id)}
                    aria-pressed={client === c.id}
                    className={cn(
                      "rounded-lg px-2 py-2.5 text-sm font-medium transition-colors",
                      client === c.id
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-background/80 hover:text-foreground",
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              {active.steps}

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {active.configLabel}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleCopy("config")}
                  >
                    {copied === "config" ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    {copied === "config" ? "Copiado" : "Copiar config"}
                  </Button>
                </div>
                <pre className="overflow-x-auto rounded-lg border bg-background p-3 text-xs leading-relaxed">
                  {configSnippet}
                </pre>
                <p className="text-xs text-muted-foreground">{active.tip}</p>
              </div>
            </div>
          </section>
        </CardContent>
      )}
    </Card>
  );
}
