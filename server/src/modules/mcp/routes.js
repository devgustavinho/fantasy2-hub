/**
 * Remote MCP (Streamable HTTP) — end users connect Cursor/agents to production
 * without cloning the monorepo. Auth = same Bearer JWT as the Hub session.
 *
 * URL: POST https://api-fantasy2.gcsolutions-devs.com.br/mcp
 * Header: Authorization: Bearer <jwt>
 */

import { Router } from "express";
import rateLimit from "express-rate-limit";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { requireAuth, requireApproved } from "../../auth/guards.js";
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
  // Loopback to this process — tools reuse the REST API with the caller's JWT.
  return `http://127.0.0.1:${env.PORT}`;
}

async function handleMcpPost(req, res) {
  const token = bearerToken(req);
  if (!token) {
    return res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Authorization Bearer obrigatório." },
      id: null,
    });
  }

  const user = toPublicUser(req.user);
  const api = createApiClient({ baseUrl: apiBaseUrl(), token });
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
  // Auth gates before creating the MCP server — same rules as the Hub UI.
  router.post("/", requireAuth, requireApproved, (req, res) => {
    void handleMcpPost(req, res);
  });
  router.get("/", methodNotAllowed);
  router.delete("/", methodNotAllowed);
  return router;
}
