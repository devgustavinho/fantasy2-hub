import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link to="/" className="font-semibold">
          Fantasy 2 Hub
        </Link>
        {user && (
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/" className="text-muted-foreground hover:text-foreground">
              Pautas
            </Link>
            {(user.role === "admin" || user.role === "sindico") && (
              <Link to="/admin" className="text-muted-foreground hover:text-foreground">
                Administração
              </Link>
            )}
            {user.role === "admin" && (
              <Link to="/admin/usuarios" className="text-muted-foreground hover:text-foreground">
                Usuários
              </Link>
            )}
            <Link to="/perfil" className="text-muted-foreground hover:text-foreground">
              {user.name}
            </Link>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              Sair
            </Button>
          </nav>
        )}
      </div>
    </header>
  );
}
