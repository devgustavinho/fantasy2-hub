export const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3100").replace(/\/+$/, "");

// Imagens de serviço vêm como URL pública completa do R2 desde a migração pro bucket da
// Cloudflare. O `startsWith` cobre só a janela de transição (linhas que ainda não passaram
// pelo script de migração no deploy do backend).
export function resolveMediaUrl(path: string) {
  return path.startsWith("http") ? path : `${API_URL}${path}`;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const TOKEN_KEY = "fantasy2_token";

// Sessão via `Authorization: Bearer`, guardada em localStorage — não cookie. Front (Cloudflare
// Pages) e API (VPS) vivem em domínios diferentes; um cookie cross-site esbarra no bloqueio de
// cookie de terceiro do Safari por padrão (mesmo com SameSite=None; Secure certinho — Chrome
// ainda permite, por isso só iPhone reclamava). Bearer token não é cookie, não é afetado por
// nenhuma dessas regras.
export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

const REQUEST_TIMEOUT_MS = 20_000;
/** Uploads multipart (ex.: PDF de balancete até 150 MB) — 20s corta no meio. */
const FORM_UPLOAD_TIMEOUT_MS = 15 * 60 * 1000;

type RequestOptions = RequestInit & { timeoutMs?: number };

// Sem isso, um `fetch` que trava (rede ruim, servidor engasgado) deixa a query do react-query
// pendurada pra sempre: nem `isLoading` nem `isError` resolvem, e a tela fica presa em
// "Carregando..." sem chance de retry. Isso limita qualquer request a no máximo 20s antes de
// virar um erro de verdade (uploads FormData usam timeout maior).
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { timeoutMs = REQUEST_TIMEOUT_MS, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const token = getToken();

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        ...(fetchOptions.body && !(fetchOptions.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...fetchOptions.headers,
      },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError("A conexão demorou demais. Verifique sua internet e tente de novo.", 0);
    }
    throw new ApiError("Não foi possível conectar ao servidor. Verifique sua internet.", 0);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    let message = `Erro ${res.status}`;
    let code: string | undefined;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
      if (typeof body?.code === "string") code = body.code;
    } catch {
      // resposta sem corpo JSON (ex.: 413 HTML do nginx)
    }
    if (res.status === 413 && message === `Erro ${res.status}`) {
      message = "Arquivo grande demais para o servidor. Reduza o tamanho e tente de novo.";
    }
    throw new ApiError(message, res.status, code);
  }

  // 204/205 e também 201 (ex. POST /push/subscribe) podem vir sem corpo — `res.json()`
  // quebra com "Unexpected end of JSON input".
  if (res.status === 204 || res.status === 205) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError("Resposta inválida do servidor.", res.status);
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "DELETE", body: body ? JSON.stringify(body) : undefined }),
  postForm: <T>(path: string, form: FormData, opts?: { timeoutMs?: number }) =>
    request<T>(path, {
      method: "POST",
      body: form,
      timeoutMs: opts?.timeoutMs ?? FORM_UPLOAD_TIMEOUT_MS,
    }),
  patchForm: <T>(path: string, form: FormData, opts?: { timeoutMs?: number }) =>
    request<T>(path, {
      method: "PATCH",
      body: form,
      timeoutMs: opts?.timeoutMs ?? FORM_UPLOAD_TIMEOUT_MS,
    }),
};
