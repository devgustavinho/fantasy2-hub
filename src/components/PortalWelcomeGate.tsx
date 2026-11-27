import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { activeIsStaff } from "@/lib/roles";
import { isPortalWelcomeDone, readWelcomeProgress } from "@/lib/welcomeProgress";

/**
 * No primeiro acesso à Home, moradores aprovados vão ao wizard de grupos
 * enquanto “Conheça o Hub” não foi liberado. Demais rotas ficam livres
 * (FAQ continua com os links recuperáveis).
 */
export function PortalWelcomeGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user || user.approvalStatus !== "approved") return children;
  if (location.pathname !== "/") return children;
  if (activeIsStaff(user.role)) return children;

  const progress = readWelcomeProgress(user.id);
  if (!isPortalWelcomeDone(progress)) {
    return <Navigate to="/primeiros-passos" replace />;
  }

  return children;
}
