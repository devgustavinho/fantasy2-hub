import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import * as statsService from "@/services/stats";

/**
 * Dispara um ping de visita quando o hub abre (landing, login, app logado…).
 * Não exige autenticação — anônimos também contam nas "Acessos nas últimas 24h".
 */
export function VisitBeacon() {
  const { loading, user } = useAuth();
  const lastLinkedUser = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (loading) return;
    const userKey = user?.id ?? null;
    // Evita re-ping em StrictMode/re-renders com o mesmo estado de auth.
    if (lastLinkedUser.current === userKey) return;
    lastLinkedUser.current = userKey;
    void statsService.recordHubVisit().catch(() => {
      // Beacon best-effort — falha de rede não deve atrapalhar a UI.
    });
  }, [loading, user?.id]);

  return null;
}
