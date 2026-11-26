/**
 * Detecção de loopback pelo endereço TCP real do socket (não usa X-Forwarded-For).
 * JWT interno (kind: "internal") só é aceito quando a conexão vem daqui —
 * é o caminho do loopback das tools do /mcp.
 */

export function isLoopbackRemoteAddress(addr) {
  if (!addr || typeof addr !== "string") return false;
  return (
    addr === "127.0.0.1" ||
    addr === "::1" ||
    addr === "::ffff:127.0.0.1"
  );
}

/**
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
export function resolveInternalJwtAccess(remoteAddress) {
  if (!isLoopbackRemoteAddress(remoteAddress)) {
    return {
      ok: false,
      code: "internal_jwt_loopback_only",
      message: "JWT interno do MCP só é válido em conexões loopback (127.0.0.1).",
    };
  }
  return { ok: true };
}
