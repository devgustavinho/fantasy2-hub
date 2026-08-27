export const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3100").replace(/\/+$/, "");

// Imagens de serviço vêm como URL pública completa do R2 desde a migração pro bucket da
// Cloudflare. O `startsWith` cobre só a janela de transição (linhas que ainda não passaram
// pelo script de migração no deploy do backend).
export function resolveMediaUrl(path: string) {
  return path.startsWith("http") ? path : `${API_URL}${path}`;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const REQUEST_TIMEOUT_MS = 20_000;

// Sem isso, um `fetch` que trava (observado em Safari/iOS com cookie cross-site — ver
// sessionCookieOptions no backend) deixa a query do react-query pendurada pra sempre: nem
// `isLoading` nem `isError` resolvem, e a tela fica presa em "Carregando..." sem chance de
// retry. Isso limita qualquer request a no máximo 20s antes de virar um erro de verdade.
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      credentials: "include",
      signal: controller.signal,
      headers: {
        ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
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
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
    } catch {
      // resposta sem corpo JSON
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
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
  postForm: <T>(path: string, form: FormData) => request<T>(path, { method: "POST", body: form }),
  patchForm: <T>(path: string, form: FormData) => request<T>(path, { method: "PATCH", body: form }),
};
