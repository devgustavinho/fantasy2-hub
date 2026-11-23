const VISITOR_KEY = "fantasy2_visitor_id";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let memoryVisitorId: string | null = null;

/** ID anônimo estável por navegador (localStorage). Usado pra dedupe de acessos. */
export function getVisitorId(): string {
  try {
    const stored = localStorage.getItem(VISITOR_KEY);
    if (stored && UUID_RE.test(stored)) return stored;
    const id = crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY, id);
    return id;
  } catch {
    if (!memoryVisitorId) memoryVisitorId = crypto.randomUUID();
    return memoryVisitorId;
  }
}
