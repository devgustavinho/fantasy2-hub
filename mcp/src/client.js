/**
 * Thin HTTP client for the Fantasy 2 Hub API (Bearer JWT de sessão — modo legado stdio).
 * Com f2h_, o pacote usa proxy HTTP → /mcp (ver proxyRemote.js), não este client.
 */

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export function createApiClient({ baseUrl, token, getToken }) {
  const root = baseUrl.replace(/\/+$/, "");
  const resolveToken = typeof getToken === "function" ? getToken : async () => token;

  async function request(method, path, body) {
    const bearer = await resolveToken();
    const res = await fetch(`${root}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${bearer}`,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
    }

    if (!res.ok) {
      const message =
        (data && typeof data === "object" && data.message) ||
        `HTTP ${res.status} ${method} ${path}`;
      throw new ApiError(String(message), res.status, data);
    }
    return data;
  }

  return {
    get: (path) => request("GET", path),
    post: (path, body) => request("POST", path, body ?? {}),
    put: (path, body) => request("PUT", path, body ?? {}),
    patch: (path, body) => request("PATCH", path, body ?? {}),
    delete: (path, body) => request("DELETE", path, body),
  };
}

export function textResult(payload) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  return { content: [{ type: "text", text }] };
}

export function errorResult(err) {
  const message =
    err instanceof ApiError
      ? `API ${err.status}: ${err.message}`
      : err instanceof Error
        ? err.message
        : String(err);
  return { content: [{ type: "text", text: message }], isError: true };
}
