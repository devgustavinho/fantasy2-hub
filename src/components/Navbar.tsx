import { Link, useNavigate } from "react-router-dom";
import { ClipboardList, LayoutDashboard, ScrollText, ShoppingBag, Tag, User, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { NotificationBell } from "@/components/NotificationBell";
import { FloatingDock, type FloatingDockItem } from "@/components/ui/floating-dock";

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  if (!user) return null;

  const isStaff = user.role === "admin" || user.role === "sindico";

  const items: FloatingDockItem[] = [
    { title: "Pautas", icon: <ClipboardList className="h-full w-full" />, href: "/" },
    { title: "Serviços", icon: <ShoppingBag className="h-full w-full" />, href: "/servicos" },
    ...(isStaff
      ? [{ title: "Administração", icon: <LayoutDashboard className="h-full w-full" />, href: "/admin" }]
      : []),
    ...(isStaff ? [{ title: "Usuários", icon: <Users className="h-full w-full" />, href: "/admin/usuarios" }] : []),
    ...(user.role === "admin"
      ? [
          { title: "Auditoria", icon: <ScrollText className="h-full w-full" />, href: "/admin/auditoria" },
          { title: "Tags", icon: <Tag className="h-full w-full" />, href: "/admin/tags" },
        ]
      : []),
    { title: "Perfil", icon: <User className="h-full w-full" />, href: "/perfil" },
  ];

  return (
    <>
      <header className="border-b border-brand-navy/60 bg-brand-navy text-white shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-2.5">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-wide">
            <img src="/logo.png" alt="Fantasy 2" className="h-9 w-9 rounded-full" />
            <span className="hidden text-brand-gold sm:inline">Fantasy 2 Hub</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <NotificationBell />
            <Link to="/perfil" className="hidden text-white/70 transition-colors hover:text-brand-gold sm:inline">
              {user.name}
            </Link>
            <button
              onClick={handleLogout}
              className="rounded-md border border-white/25 px-3 py-1.5 text-white/90 transition-colors hover:border-white/50 hover:bg-white/10"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
        <FloatingDock items={items} />
      </div>
    </>
  );
}
