import { useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Building2,
  ClipboardList,
  Columns3,
  Gauge,
  HelpCircle,
  Home,
  LayoutDashboard,
  Lightbulb,
  ScrollText,
  Shield,
  ShoppingBag,
  Star,
  Tag,
  User,
  Users,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { NotificationBell } from "@/components/NotificationBell";
import { FloatingDock, type FloatingDockItem } from "@/components/ui/floating-dock";
import { BottomSheet } from "@/components/ui/bottom-sheet";

export function TopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  if (!user) return null;

  return (
    <header className="border-b border-brand-navy/60 bg-brand-navy text-white shadow-sm">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-2.5">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-wide">
          <img src="/logo.png" alt="Fantasy 2" className="h-9 w-9 rounded-full" />
          <span className="hidden text-brand-gold sm:inline">Fantasy 2 Hub</span>
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <NotificationBell />
          <Link
            to="/perfil"
            aria-label="Perfil"
            className="flex items-center gap-1.5 text-white/70 transition-colors hover:text-brand-gold"
          >
            <User className="h-5 w-5 sm:hidden" />
            <span className="hidden sm:inline">{user.name}</span>
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
  );
}

type AdminLink = {
  title: string;
  href: string;
  icon: ReactNode;
  description: string;
};

// `sticky` (não `fixed`) de propósito: em vários navegadores mobile (barra de endereço que
// aparece/some), um elemento `position: fixed` no rodapé fica ancorado no "layout viewport"
// (que inclui a área atrás da barra do navegador) em vez do viewport visível — o dock parece
// "flutuar" acima do rodapé de verdade, com um vão embaixo. `sticky` dentro de um container
// flex de altura mínima 100dvh não sofre desse problema: ele é sempre o último item da coluna,
// empurrado pro fim do conteúdo (ou colado no fim da tela visível, o que for maior).
export function BottomDock() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [adminOpen, setAdminOpen] = useState(false);

  if (!user) return null;

  const isStaff = user.role === "admin" || user.role === "sindico";
  const isAdmin = user.role === "admin";
  const onAdminRoute = location.pathname.startsWith("/admin");

  // Modo morador: só navegação do condomínio. Staff ganha um único item "Admin" com submenu.
  const items: FloatingDockItem[] = [
    { title: "Início", icon: <Home className="h-full w-full" />, href: "/" },
    { title: "Pautas", icon: <ClipboardList className="h-full w-full" />, href: "/pautas" },
    { title: "Serviços", icon: <ShoppingBag className="h-full w-full" />, href: "/servicos" },
    { title: "Recomendações", icon: <Star className="h-full w-full" />, href: "/recomendacoes" },
    { title: "FAQ", icon: <HelpCircle className="h-full w-full" />, href: "/faq" },
    { title: "Clima", icon: <Gauge className="h-full w-full" />, href: "/clima" },
    { title: "Melhorias", icon: <Lightbulb className="h-full w-full" />, href: "/melhorias" },
    ...(isStaff
      ? [
          {
            title: "Admin",
            icon: <Shield className="h-full w-full" />,
            onClick: () => setAdminOpen(true),
            active: onAdminRoute || adminOpen,
          },
        ]
      : []),
  ];

  const adminLinks: AdminLink[] = [
    {
      title: "Painel",
      href: "/admin",
      icon: <LayoutDashboard className="h-5 w-5" />,
      description: "Pautas por engajamento e acessos",
    },
    {
      title: "Melhorias",
      href: "/melhorias",
      icon: <Columns3 className="h-5 w-5" />,
      description: "Quadro de sugestões do Portal",
    },
    {
      title: "Usuários",
      href: "/admin/usuarios",
      icon: <Users className="h-5 w-5" />,
      description: "Moradores, cargos e aprovações",
    },
    ...(isAdmin
      ? [
          {
            title: "Auditoria",
            href: "/admin/auditoria",
            icon: <ScrollText className="h-5 w-5" />,
            description: "Histórico de ações",
          },
          {
            title: "Tags",
            href: "/admin/tags",
            icon: <Tag className="h-5 w-5" />,
            description: "Tags de serviços",
          },
          {
            title: "Apartamentos",
            href: "/admin/apartamentos",
            icon: <Building2 className="h-5 w-5" />,
            description: "Mapa das torres",
          },
          {
            title: "Boas-vindas",
            href: "/admin/boas-vindas",
            icon: <Home className="h-5 w-5" />,
            description: "Página do QR do elevador",
          },
        ]
      : []),
  ];

  function goAdmin(href: string) {
    setAdminOpen(false);
    navigate(href);
  }

  return (
    <>
      <div className="sticky bottom-4 z-30 mt-6 flex justify-center px-4 [padding-bottom:env(safe-area-inset-bottom)]">
        <FloatingDock items={items} />
      </div>

      <BottomSheet
        open={adminOpen}
        onClose={() => setAdminOpen(false)}
        title="Administração"
        description="Atalhos do painel — pensado para o celular."
      >
        <ul className="space-y-1">
          {adminLinks.map((link) => {
            const active = location.pathname === link.href;
            return (
              <li key={link.href}>
                <button
                  type="button"
                  onClick={() => goAdmin(link.href)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${
                    active ? "bg-primary/10 text-primary" : "hover:bg-muted"
                  }`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-navy/90 text-white">
                    {link.icon}
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{link.title}</span>
                    <span className="block text-xs text-muted-foreground">{link.description}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </BottomSheet>
    </>
  );
}
