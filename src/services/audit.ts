import { api } from "@/lib/api";
import type { AuditEntry } from "@/lib/types";

export const listAudit = () => api.get<{ entries: AuditEntry[] }>("/audit");
