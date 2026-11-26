/**
 * Proxy stdio ↔ MCP remoto (Streamable HTTP) quando FANTASY2_TOKEN é f2h_.
 *
 * Não troca o API token por JWT REST: o f2h_ só fala com /mcp; o servidor remoto
 * faz o loopback interno. Assim o JWT interno nunca sai do processo da API.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

export async function runStdioProxyToRemoteMcp(baseUrl, apiToken) {
  const mcpUrl = new URL("mcp", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);

  const remote = new Client({ name: "fantasy2-hub-stdio-proxy", version: "1.0.0" });
  const httpTransport = new StreamableHTTPClientTransport(mcpUrl, {
    requestInit: {
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    },
  });
  await remote.connect(httpTransport);

  const local = new Server(
    { name: "fantasy2-hub", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  local.setRequestHandler(ListToolsRequestSchema, async () => remote.listTools());
  local.setRequestHandler(CallToolRequestSchema, async (request) =>
    remote.callTool(request.params),
  );

  const tools = await remote.listTools();
  console.error(
    `fantasy2-hub MCP (stdio→HTTP proxy): ${tools.tools?.length ?? 0} tools via ${mcpUrl.href}`,
  );

  const stdio = new StdioServerTransport();
  await local.connect(stdio);
}
