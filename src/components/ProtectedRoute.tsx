import { Navigate, Outlet } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { PendingApproval } from "@/components/PendingApproval";
import { useAuth } from "@/contexts/AuthContext";

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

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <ApprovalGate />;
}

// admin + sindico: painel de pautas por engajamento, marcar/reabrir pauta
export function StaffRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin" && user.role !== "sindico") return <Navigate to="/" replace />;
  return <ApprovalGate />;
}

// só admin: ações administrativas mais sensíveis (auditoria, promover a admin, etc.)
export function AdminOnlyRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/" replace />;
  return <ApprovalGate />;
}
