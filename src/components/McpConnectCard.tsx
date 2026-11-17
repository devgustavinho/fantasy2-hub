import { useMemo, useState } from "react";
import { Check, Copy, Eye, EyeOff, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getToken } from "@/lib/api";

const PROD_API_URL = "https://api-fantasy2.gcsolutions-devs.com.br";
const PROD_APP_URL = "https://fantasy2-hub.pages.dev";
const REPO_URL = "https://github.com/devgustavinho/fantasy2-hub";
const MCP_ENTRY_HINT = "/caminho/absoluto/fantasy2-hub/mcp/src/index.js";

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

function buildCursorConfig(tokenPlaceholder: string) {
  return `{
  "mcpServers": {
    "fantasy2-hub": {
      "command": "node",
      "args": ["${MCP_ENTRY_HINT}"],
      "env": {
        "FANTASY2_API_URL": "${PROD_API_URL}",
        "FANTASY2_TOKEN": "${tokenPlaceholder}"
      }
    }
  }
}`;
}

export function McpConnectCard() {
  const token = getToken() ?? "";
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<"token" | "config" | null>(null);

  const configSnippet = useMemo(
    () => buildCursorConfig(token || "cole-o-jwt-aqui"),
    [token],
  );

  const maskedToken = token
    ? `${token.slice(0, 12)}…${token.slice(-8)}`
    : "(faça login de novo se o token não aparecer)";

  async function handleCopy(kind: "token" | "config") {
    const value = kind === "token" ? token : configSnippet;
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
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Plug className="h-4 w-4 text-primary" />
          Conectar MCP
        </CardTitle>
        <CardDescription>
          Use o Fantasy 2 Hub no Cursor (ou outro cliente MCP) com as mesmas permissões da sua
          conta. O token equivale a estar logado — não compartilhe e não committe.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <ol className="list-decimal space-y-2 pl-4 text-muted-foreground">
          <li>
            Clone o repo{" "}
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              devgustavinho/fantasy2-hub
            </a>{" "}
            e rode <code className="rounded bg-muted px-1 py-0.5 text-xs">npm install</code> em{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">mcp/</code>.
          </li>
          <li>
            No Cursor → Settings → MCP, adicione o JSON abaixo (troque o caminho absoluto do{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">index.js</code>).
          </li>
          <li>Cole o JWT da sessão em <code className="rounded bg-muted px-1 py-0.5 text-xs">FANTASY2_TOKEN</code>.</li>
        </ol>

        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Caminhos e URLs
          </p>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li>
              App:{" "}
              <a href={PROD_APP_URL} className="break-all text-foreground underline-offset-2 hover:underline">
                {PROD_APP_URL}
              </a>
            </li>
            <li>
              API:{" "}
              <code className="break-all rounded bg-muted px-1 py-0.5 text-foreground">{PROD_API_URL}</code>
            </li>
            <li>
              Entrada MCP:{" "}
              <code className="break-all rounded bg-muted px-1 py-0.5 text-foreground">
                …/fantasy2-hub/mcp/src/index.js
              </code>
            </li>
            <li>
              Alternativa:{" "}
              <code className="break-all rounded bg-muted px-1 py-0.5 text-foreground">
                npm --prefix …/fantasy2-hub/mcp start
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
                {copied === "token" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied === "token" ? "Copiado" : "Copiar token"}
              </Button>
            </div>
          </div>
          <pre className="overflow-x-auto rounded-lg border bg-background p-3 text-xs leading-relaxed break-all whitespace-pre-wrap">
            {revealed && token ? token : maskedToken}
          </pre>
          <p className="text-xs text-muted-foreground">
            É o mesmo valor de <code className="rounded bg-muted px-1">localStorage.fantasy2_token</code>{" "}
            neste aparelho. Admin: só após o 2FA.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Snippet Cursor (MCP)
            </p>
            <Button type="button" size="sm" variant="outline" onClick={() => handleCopy("config")}>
              {copied === "config" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied === "config" ? "Copiado" : "Copiar JSON"}
            </Button>
          </div>
          <pre className="overflow-x-auto rounded-lg border bg-background p-3 text-xs leading-relaxed">
            {configSnippet}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}
