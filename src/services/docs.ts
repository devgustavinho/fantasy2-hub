import { api, API_URL, ApiError, getToken } from "@/lib/api";

export type CondoDocument = {
  id: string;
  title: string;
  description: string;
  contentType: string;
  path: string;
};

export function listDocuments() {
  return api.get<{ documents: CondoDocument[] }>("/docs");
}

/**
 * Abre o Manual do Proprietário com Bearer (rota protegida).
 * `download: true` força attachment; senão abre inline em nova aba.
 */
export async function openManualPdf(opts: { download?: boolean } = {}) {
  const token = getToken();
  if (!token) throw new ApiError("Faça login para abrir o manual.", 401);

  const qs = opts.download ? "?download=1" : "";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  let res: Response;
  try {
    res = await fetch(`${API_URL}/docs/manual-do-proprietario${qs}`, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError("O download demorou demais. Tente de novo.", 0);
    }
    throw new ApiError("Não foi possível baixar o manual.", 0);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    let message = `Erro ${res.status}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
    } catch {
      // sem JSON
    }
    throw new ApiError(message, res.status);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  if (opts.download) a.download = "Manual-do-Proprietario-Fantasy-2.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoga depois de a aba/navegador consumir o blob.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
