#!/usr/bin/env node
/**
 * Fantasy 2 Hub MCP server (stdio).
 *
 * Env:
 *   FANTASY2_API_URL  — base URL da API (default http://127.0.0.1:3100)
 *   FANTASY2_TOKEN    — API token `f2h_…` (recomendado) ou JWT de sessão (legado)
 *
 * Com f2h_: proxy stdio → POST /mcp (Streamable HTTP). O token nunca vira JWT REST
 * neste processo — a API só emite JWT interno no loopback das tools.
 *
 * Com JWT de sessão: tools locais chamam a REST diretamente (modo legado).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createApiClient } from "./client.js";
import { runStdioProxyToRemoteMcp } from "./proxyRemote.js";
import { permissionTier } from "./roles.js";
import { registerToolsForUser } from "./tools.js";

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing required env ${name}. See mcp/README.md.`);
    process.exit(1);
  }
  return value;
}

async function runLocalToolsWithSessionJwt(baseUrl, token) {
  const api = createApiClient({ baseUrl, token });

  let me;
  try {
    me = await api.get("/auth/me");
  } catch (err) {
    console.error(`Falha ao autenticar em ${baseUrl}/auth/me: ${err.message}`);
    process.exit(1);
  }

  const user = me.user;
  if (!user) {
    console.error("Resposta /auth/me sem user.");
    process.exit(1);
  }
  if (user.approvalStatus !== "approved") {
    console.error(`Cadastro não aprovado (status=${user.approvalStatus}). MCP requer conta aprovada.`);
    process.exit(1);
  }

  const server = new McpServer({
    name: "fantasy2-hub",
    version: "1.0.0",
  });

  const tools = registerToolsForUser(server, api, user);
  console.error(
    `fantasy2-hub MCP: ${user.email} role=${user.role} roles=${(user.roles ?? [user.role]).join("+")} tier=${permissionTier(user)} tools=${tools.length} api=${baseUrl}`,
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function main() {
  const baseUrl = (process.env.FANTASY2_API_URL || "http://127.0.0.1:3100").trim();
  const rawToken = requireEnv("FANTASY2_TOKEN");

  if (rawToken.startsWith("f2h_")) {
    await runStdioProxyToRemoteMcp(baseUrl, rawToken);
    return;
  }

  await runLocalToolsWithSessionJwt(baseUrl, rawToken);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
