import { useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Building2,
  ClipboardList,
  Clock,
  Columns3,
  Ellipsis,
  FileSpreadsheet,
  FileText,
  Gauge,
  HelpCircle,
  Home,
  LayoutDashboard,
  Lightbulb,
  MessageCircleQuestion,
  ScrollText,
  Settings2,
  Shield,
  ShoppingBag,
  Star,
  User,
  Users,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { NotificationBell } from "@/components/NotificationBell";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { TabBar, type TabBarItem } from "@/components/ui/tab-bar";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { anyPathMatches, pathMatches } from "@/lib/nav";
import { activeIsAdmin, activeIsStaff, homePathForRole, userRoles } from "@/lib/roles";

export function TopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  if (!user) return null;

  const multiRole = userRoles(user).length > 1;
  const homeHref = homePathForRole(user.role);

  return (
    <header className="z-20 shrink-0 border-b border-brand-navy/60 bg-brand-navy text-white shadow-sm">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-2 px-3 py-2.5 sm:px-4 md:max-w-none md:justify-end md:px-6 lg:px-8">
        {/* Marca só no mobile — no desktop a sidebar carrega o brand. */}
        <Link
          to={homeHref}
          className="flex min-w-0 items-center gap-2 font-semibold tracking-wide md:hidden"
        >
          <img src="/logo.png" alt="Fantasy 2 comunidade" className="h-9 w-9 shrink-0 rounded-full object-cover" />
          <span className="hidden truncate text-brand-gold sm:inline">Fantasy 2 Hub</span>
        </Link>
        <div className="flex shrink-0 items-center gap-2 text-sm sm:gap-3">
          {multiRole && <RoleSwitcher />}
          <NotificationBell />
          <Link
            to="/perfil"
            aria-label="Perfil"
            className="flex items-center gap-1.5 text-white/70 transition-colors hover:text-brand-gold"
          >
            <User className="h-5 w-5 sm:hidden" />
            <span className="hidden max-w-[12rem] truncate sm:inline">{user.name}</span>
          </Link>
          <button
            onClick={handleLogout}
            className="rounded-md border border-white/25 px-2.5 py-1.5 text-white/90 transition-colors hover:border-white/50 hover:bg-white/10 sm:px-3"
          >
            Sair
          </button>
        </div>
      </div>
    </header>
  );
}

type SheetLink = {
  title: string;
  href: string;
  icon: ReactNode;
  description: string;
};

// Tab bar no shell flex (irmã do main, fora do scroll) — ícone + rótulo.
// Em md+ a DesktopSidebar assume; esta barra fica só no mobile (`md:hidden`).
export function BottomDock() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [adminOpen, setAdminOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  if (!user) return null;

  const staffMode = activeIsStaff(user.role);
  const isAdmin = activeIsAdmin(user.role);
  const onAdminRoute = location.pathname.startsWith("/admin");
  const path = location.pathname;

  const moreLinks: SheetLink[] = [
    {
      title: "Recomendações",
      href: "/recomendacoes",
      icon: <Star className="h-5 w-5" />,
      description: "Indicações da comunidade",
    },
    {
      title: "FAQ",
      href: "/faq",
      icon: <HelpCircle className="h-5 w-5" />,
      description: "Perguntas frequentes",
    },
    {
      title: "Horários",
      href: "/horarios",
      icon: <Clock className="h-5 w-5" />,
      description: "Áreas comuns, mudanças e convivência",
    },
    {
      title: "Documentos",
      href: "/documentos",
      icon: <FileText className="h-5 w-5" />,
      description: "Manuais e documentos do condomínio",
    },
    {
      title: "Clima",
      href: "/clima",
      icon: <Gauge className="h-5 w-5" />,
      description: "Pesquisas de clima organizacional",
    },
    {
      title: "Melhorias",
      href: "/melhorias",
      icon: <Lightbulb className="h-5 w-5" />,
      description: "Sugestões para o Portal",
    },
    {
      title: "Organização contábil",
      href: "/contabil",
      icon: <FileSpreadsheet className="h-5 w-5" />,
      // Morador: só consulta; conselheiro também dá parecer nesta área.
      description: "Balancetes e pareceres do conselho",
    },
  ];

  const moreHrefs = moreLinks.map((l) => l.href);
  const onMoreRoute = anyPathMatches(path, moreHrefs);

  const iconCls = "h-5 w-5";

  // Dois modos exclusivos (#56): morador/conselheiro OU admin/síndico — nunca misturados.
  const residentItems: TabBarItem[] = [
    {
      title: "Início",
      icon: <Home className={iconCls} />,
      href: "/",
      active: path === "/",
    },
    {
      title: "Pautas",
      icon: <ClipboardList className={iconCls} />,
      href: "/pautas",
      active: path === "/pautas" || path.startsWith("/pautas/"),
    },
    {
      title: "Negócios",
      shortTitle: "Negóc.",
      icon: <ShoppingBag className={iconCls} />,
      href: "/negocios",
      active:
        path === "/negocios" ||
        path.startsWith("/negocios/") ||
        path === "/servicos" ||
        path.startsWith("/servicos/"),
    },
    {
      title: "Perguntar",
      shortTitle: "Perg.",
      icon: <MessageCircleQuestion className={iconCls} />,
      href: "/perguntar",
      active: path === "/perguntar" || path.startsWith("/perguntar/"),
    },
    {
      title: "Mais",
      icon: <Ellipsis className={iconCls} />,
      onClick: () => setMoreOpen(true),
      active: onMoreRoute || moreOpen,
    },
  ];

  const onUsuarios = path.startsWith("/admin/usuarios");
  const onMelhorias = path === "/melhorias" || path.startsWith("/melhorias/");
  const onContabil = path === "/contabil" || path.startsWith("/contabil/");
  const staffItems: TabBarItem[] = [
    {
      title: "Painel",
      icon: <LayoutDashboard className={iconCls} />,
      href: "/admin",
      active: path === "/admin",
    },
    {
      title: "Usuários",
      shortTitle: "Usuár.",
      icon: <Users className={iconCls} />,
      href: "/admin/usuarios",
      active: onUsuarios,
    },
    {
      title: "Melhorias",
      shortTitle: "Melhor.",
      icon: <Columns3 className={iconCls} />,
      href: "/melhorias",
      active: onMelhorias,
    },
    {
      title: "Admin",
      icon: <Shield className={iconCls} />,
      onClick: () => setAdminOpen(true),
      // Contábil fica no sheet Admin (não é /admin/*) — manter o tab ativo.
      active:
        adminOpen ||
        onContabil ||
        (onAdminRoute && path !== "/admin" && !onUsuarios),
    },
  ];

  const items = staffMode ? staffItems : residentItems;

  const adminLinks: SheetLink[] = [
    {
      title: "Organização contábil",
      href: "/contabil",
      icon: <FileSpreadsheet className="h-5 w-5" />,
      description: "Publicar e gerenciar balancetes",
    },
    {
      title: "Configurações",
      href: "/admin/configuracoes",
      icon: <Settings2 className="h-5 w-5" />,
      description: "Boas-vindas, RAG, horários, FAQ e integrações",
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
            title: "Apartamentos",
            href: "/admin/apartamentos",
            icon: <Building2 className="h-5 w-5" />,
            description: "Mapa das torres",
          },
        ]
      : []),
  ];

  function goTo(href: string, close: () => void) {
    close();
    navigate(href);
  }

  function renderSheetLinks(links: SheetLink[], close: () => void) {
    return (
      <ul className="space-y-1">
        {links.map((link) => {
          const active = pathMatches(location.pathname, link.href);
          return (
            <li key={`${link.href}-${link.title}`}>
              <button
                type="button"
                onClick={() => goTo(link.href, close)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${
                  active ? "bg-primary/10 text-primary" : "hover:bg-muted"
                }`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-navy/90 text-white">
                  {link.icon}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{link.title}</span>
                  <span className="block text-xs text-muted-foreground">{link.description}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="shrink-0 md:hidden">
      <TabBar items={items} />

      {!staffMode && (
        <BottomSheet
          open={moreOpen}
          onClose={() => setMoreOpen(false)}
          title="Mais"
          description="Outras áreas do condomínio."
        >
          {renderSheetLinks(moreLinks, () => setMoreOpen(false))}
        </BottomSheet>
      )}

      {staffMode && (
        <BottomSheet
          open={adminOpen}
          onClose={() => setAdminOpen(false)}
          title="Administração"
          description="Mais atalhos do painel — pensado para o celular."
        >
          {renderSheetLinks(adminLinks, () => setAdminOpen(false))}
        </BottomSheet>
      )}
    </div>
  );
}
