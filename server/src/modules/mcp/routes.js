/**
 * Remote MCP (Streamable HTTP) — end users connect Cursor/agents to production
 * without cloning the monorepo.
 *
 * Auth: API token rotativo `f2h_…` (recomendado). JWT de sessão ainda é aceito
 * temporariamente no /mcp, com header/aviso de depreciação — migre para f2h_.
 *
 * Segurança: se o Bearer for API token, trocamos por um JWT interno de curta
 * duração antes do loopback REST — o token f2h_ nunca é repassado às rotas da API.
 * O JWT interno (kind: "internal") só é aceito em conexão loopback (127.0.0.1);
 * fora disso → 401. Assim um f2h_ vazado não amplia acesso à REST pública via troca.
 * Um guard global (rejectApiTokenOutsideMcp) bloqueia f2h_ fora de `/mcp`.
 * Uso do /mcp com f2h_ NÃO exige 2FA (2FA na criação/rotação do token no Hub).
 * Tools continuam filtradas por cargo (registerToolsForUser / permissionTier).
 *
 * URL: POST https://api-fantasy2.gcsolutions-devs.com.br/mcp
 * Header: Authorization: Bearer <f2h_… | jwt-depreciado>
 *
 * POST /mcp/session — troca f2h_ por JWT interno (só útil em loopback; o pacote
 * stdio com f2h_ prefere proxy HTTP → /mcp e não depende desta rota).
 */

import { Router } from "express";
import rateLimit from "express-rate-limit";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { requireAuth, requireApproved } from "../../auth/guards.js";
import { INTERNAL_SESSION_TTL_SECONDS, signInternalSession } from "../../auth/jwt.js";
import { toPublicUser } from "../../auth/publicUser.js";
import { env } from "../../env.js";
import { createApiClient } from "./client.js";
import { permissionTier } from "./roles.js";
import { registerToolsForUser } from "./tools.js";

const mcpLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

function bearerToken(req) {
  const auth = req.headers.authorization;
  return auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
}

function apiBaseUrl() {
  // Loopback to this process — tools reuse the REST API with a short-lived JWT.
  return `http://127.0.0.1:${env.PORT}`;
}

/** API token → JWT interno curto; sessão JWT passa direto. */
function loopbackBearer(req) {
  if (req.authKind === "api_token") {
    if (!req.apiTokenScopes?.includes("mcp")) {
      return { error: "Token sem escopo mcp." };
    }
    return { token: signInternalSession({ sub: req.user.id }) };
  }
  const token = bearerToken(req);
  if (!token) return { error: "Authorization Bearer obrigatório." };
  return { token };
}

function warnSessionJwtDeprecated(req, res) {
  if (req.authKind !== "session") return;
  res.setHeader("Deprecation", "true");
  res.setHeader(
    "Warning",
    '299 - "JWT de sessão no /mcp está depreciado; use um API token f2h_ (Perfil → Avançado)."',
  );
  console.warn(
    "mcp: Authorization com JWT de sessão está depreciado — migre para API token f2h_.",
  );
}

async function handleMcpPost(req, res) {
  warnSessionJwtDeprecated(req, res);

  const swapped = loopbackBearer(req);
  if (swapped.error) {
    return res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: swapped.error },
      id: null,
    });
  }

  const user = toPublicUser(req.user);
  const api = createApiClient({ baseUrl: apiBaseUrl(), token: swapped.token });
  const server = new McpServer({
    name: "fantasy2-hub",
    version: "1.0.0",
  });
  const tools = registerToolsForUser(server, api, user);

  // Stateless: one transport + server per request (no session sticky).
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  const cleanup = () => {
    void transport.close();
    void server.close();
  };
  res.on("close", cleanup);

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    if (process.env.NODE_ENV !== "production") {
      console.error(
        `mcp http: ${user.email} role=${user.role} roles=${(user.roles ?? [user.role]).join("+")} tier=${permissionTier(user)} tools=${tools.length}`,
      );
    }
  } catch (err) {
    console.error("mcp http error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Erro interno do MCP." },
        id: null,
      });
    }
  }
}

function methodNotAllowed(_req, res) {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Use POST neste endpoint (Streamable HTTP sem sessão)." },
    id: null,
  });
}

export function mcpRoutes() {
  const router = Router();
  router.use(mcpLimiter);

  // Stdio / clientes que precisam chamar a REST com JWT curto a partir de f2h_.
  router.post("/session", requireAuth, requireApproved, (req, res) => {
    if (req.authKind !== "api_token") {
      return res.status(400).json({
        message: "Só API tokens (f2h_) podem ser trocados por JWT interno.",
      });
    }
    if (!req.apiTokenScopes?.includes("mcp")) {
      return res.status(403).json({ message: "Token sem escopo mcp." });
    }
    const token = signInternalSession({ sub: req.user.id });
    res.json({ token, expiresIn: INTERNAL_SESSION_TTL_SECONDS });
  });

  // Auth gates before creating the MCP server — same rules as the Hub UI.
  router.post("/", requireAuth, requireApproved, (req, res) => {
    void handleMcpPost(req, res);
  });
  router.get("/", methodNotAllowed);
  router.delete("/", methodNotAllowed);
  return router;
}
