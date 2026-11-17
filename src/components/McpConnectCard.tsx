import { useMemo, useState } from "react";
import { Check, Copy, Eye, EyeOff, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getToken } from "@/lib/api";

const PROD_API_URL = "https://api-fantasy2.gcsolutions-devs.com.br";
const PROD_APP_URL = "https://fantasy2-hub.pages.dev";
const MCP_URL = `${PROD_API_URL}/mcp`;

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

function buildCursorConfig(tokenPlaceholder: string) {
  return `{
  "mcpServers": {
    "fantasy2-hub": {
      "url": "${MCP_URL}",
      "headers": {
        "Authorization": "Bearer ${tokenPlaceholder}"
      }
    }
  }
}`;
}

export function McpConnectCard() {
  const token = getToken() ?? "";
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<"token" | "config" | "url" | null>(null);

  const configSnippet = useMemo(
    () => buildCursorConfig(token || "cole-o-jwt-da-sessao-aqui"),
    [token],
  );

  const maskedToken = token
    ? `${token.slice(0, 12)}…${token.slice(-8)}`
    : "(faça login de novo se o token não aparecer)";

  async function handleCopy(kind: "token" | "config" | "url") {
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
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Plug className="h-4 w-4 text-primary" />
          Conectar MCP
        </CardTitle>
        <CardDescription>
          Conecte o Cursor (ou outro agente MCP) ao Fantasy 2 Hub em produção — serviço remoto,
          com as mesmas permissões do seu cargo. Não é preciso clonar o projeto.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <ol className="list-decimal space-y-2 pl-4 text-muted-foreground">
          <li>
            Abra o Cursor → Settings → MCP (ou edite{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">~/.cursor/mcp.json</code>).
          </li>
          <li>Cole o snippet abaixo (já aponta para a API de produção).</li>
          <li>
            Confirme o JWT da sessão em{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">Authorization</code> — use{" "}
            <strong className="font-medium text-foreground">Copiar token</strong> se precisar
            atualizar.
          </li>
          <li>Salve e reinicie o MCP / o Cursor. As tools respeitam seu cargo (morador, síndico, admin…).</li>
        </ol>

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
              <code className="break-all rounded bg-muted px-1 py-0.5 text-foreground">{MCP_URL}</code>
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
                {copied === "token" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied === "token" ? "Copiado" : "Copiar token"}
              </Button>
            </div>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border bg-background p-3 text-xs leading-relaxed">
            {revealed && token ? token : maskedToken}
          </pre>
          <p className="text-xs text-muted-foreground">
            Equivale a estar logado neste aparelho. Não compartilhe nem committe. Admin: só após o
            2FA.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Snippet Cursor (MCP remoto)
            </p>
            <Button type="button" size="sm" variant="outline" onClick={() => handleCopy("config")}>
              {copied === "config" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied === "config" ? "Copiado" : "Copiar config"}
            </Button>
          </div>
          <pre className="overflow-x-auto rounded-lg border bg-background p-3 text-xs leading-relaxed">
            {configSnippet}
          </pre>
          <p className="text-xs text-muted-foreground">
            Dica: em vez de colar o JWT no arquivo, use{" "}
            <code className="rounded bg-muted px-1">{"Bearer ${env:FANTASY2_TOKEN}"}</code> e
            exporte o token no ambiente do Cursor.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
