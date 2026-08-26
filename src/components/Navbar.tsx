import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { NotificationBell } from "@/components/NotificationBell";

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <header className="border-b border-brand-navy/60 bg-brand-navy text-white shadow-sm">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-2.5">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-wide">
          <img src="/logo.png" alt="Fantasy 2" className="h-9 w-9 rounded-full" />
          <span className="hidden text-brand-gold sm:inline">Fantasy 2 Hub</span>
        </Link>
        {user && (
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/" className="text-white/70 transition-colors hover:text-white">
              Pautas
            </Link>
            {(user.role === "admin" || user.role === "sindico") && (
              <Link to="/admin" className="text-white/70 transition-colors hover:text-white">
                Administração
              </Link>
            )}
            {(user.role === "admin" || user.role === "sindico") && (
              <Link to="/admin/usuarios" className="text-white/70 transition-colors hover:text-white">
                Usuários
              </Link>
            )}
            {user.role === "admin" && (
              <Link to="/admin/auditoria" className="text-white/70 transition-colors hover:text-white">
                Auditoria
              </Link>
            )}
            <NotificationBell />
            <Link to="/perfil" className="text-white/70 transition-colors hover:text-brand-gold">
              {user.name}
            </Link>
            <button
              onClick={handleLogout}
              className="rounded-md border border-white/25 px-3 py-1.5 text-white/90 transition-colors hover:border-white/50 hover:bg-white/10"
            >
              Sair
            </button>
          </nav>
        )}
      </div>
    </header>
  );
}
