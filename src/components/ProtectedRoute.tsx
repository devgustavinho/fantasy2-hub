import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { PendingApproval } from "@/components/PendingApproval";
import { useAuth } from "@/contexts/AuthContext";
import Landing from "@/pages/Landing";

function ApprovalGate() {
  const { user, logout } = useAuth();
  if (!user || user.approvalStatus === "approved") return <Outlet />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-navy px-4">
      <Card className="w-full max-w-sm">
        <CardContent className="pt-6">
          <PendingApproval status={user.approvalStatus} onAction={() => logout()} />
        </CardContent>
      </Card>
    </div>
  );
}

// Guarda o destino original (ex. um link de pauta compartilhado no WhatsApp) pra Login.tsx
// mandar de volta pra lá depois de autenticar, em vez de sempre cair na home.
function useLoginRedirect() {
  const location = useLocation();
  return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
}

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const redirect = useLoginRedirect();
  if (loading) return null;
  if (!user) {
    // "/" sem sessão mostra a landing page (explica o que é o site) em vez de já cair direto no
    // login sem contexto nenhum — as demais rotas protegidas continuam indo pro /login normal.
    if (location.pathname === "/") return <Landing />;
    return redirect;
  }
  return <ApprovalGate />;
}

// admin + sindico: painel de pautas por engajamento, marcar/reabrir pauta
export function StaffRoute() {
  const { user, loading } = useAuth();
  const redirect = useLoginRedirect();
  if (loading) return null;
  if (!user) return redirect;
  if (user.role !== "admin" && user.role !== "sindico") return <Navigate to="/" replace />;
  return <ApprovalGate />;
}

// só admin: ações administrativas mais sensíveis (auditoria, promover a admin, etc.)
export function AdminOnlyRoute() {
  const { user, loading } = useAuth();
  const redirect = useLoginRedirect();
  if (loading) return null;
  if (!user) return redirect;
  if (user.role !== "admin") return <Navigate to="/" replace />;
  return <ApprovalGate />;
}
