import { Link, useLocation } from "react-router-dom";
import {
  Building2,
  ClipboardList,
  Clock,
  Columns3,
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
  ShoppingBag,
  Star,
  Users,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { activeIsAdmin, activeIsStaff, homePathForRole } from "@/lib/roles";
import { pathMatches, type NavLink } from "@/lib/nav";
import { cn } from "@/lib/utils";

const iconCls = "h-4 w-4 shrink-0";

function residentPrimary(): NavLink[] {
  return [
    {
      title: "Início",
      href: "/",
      description: "Visão geral",
      icon: <Home className={iconCls} />,
    },
    {
      title: "Pautas",
      href: "/pautas",
      description: "Assembleias e discussões",
      icon: <ClipboardList className={iconCls} />,
    },
    {
      title: "Negócios",
      href: "/negocios",
      description: "Serviços da comunidade",
      icon: <ShoppingBag className={iconCls} />,
    },
    {
      title: "Perguntar",
      href: "/perguntar",
      description: "Tire dúvidas do condomínio",
      icon: <MessageCircleQuestion className={iconCls} />,
    },
  ];
}

function residentSecondary(): NavLink[] {
  return [
    {
      title: "Recomendações",
      href: "/recomendacoes",
      description: "Indicações da comunidade",
      icon: <Star className={iconCls} />,
    },
    {
      title: "FAQ",
      href: "/faq",
      description: "Perguntas frequentes",
      icon: <HelpCircle className={iconCls} />,
    },
    {
      title: "Horários",
      href: "/horarios",
      description: "Áreas comuns e convivência",
      icon: <Clock className={iconCls} />,
    },
    {
      title: "Documentos",
      href: "/documentos",
      description: "Manuais do condomínio",
      icon: <FileText className={iconCls} />,
    },
    {
      title: "Clima",
      href: "/clima",
      description: "Pesquisas de clima",
      icon: <Gauge className={iconCls} />,
    },
    {
      title: "Melhorias",
      href: "/melhorias",
      description: "Sugestões para o Portal",
      icon: <Lightbulb className={iconCls} />,
    },
    {
      title: "Organização contábil",
      href: "/contabil",
      // Visível no modo morador/conselheiro — morador só lê; conselheiro dá parecer.
      description: "Balancetes e pareceres",
      icon: <FileSpreadsheet className={iconCls} />,
    },
  ];
}

function staffPrimary(): NavLink[] {
  return [
    {
      title: "Painel",
      href: "/admin",
      description: "Resumo administrativo",
      icon: <LayoutDashboard className={iconCls} />,
    },
    {
      title: "Usuários",
      href: "/admin/usuarios",
      description: "Gestão de moradores",
      icon: <Users className={iconCls} />,
    },
    {
      title: "Melhorias",
      href: "/melhorias",
      description: "Quadro de sugestões",
      icon: <Columns3 className={iconCls} />,
    },
  ];
}

function staffSecondary(isAdmin: boolean): NavLink[] {
  return [
    {
      title: "Organização contábil",
      href: "/contabil",
      description: "Publicar e gerenciar balancetes",
      icon: <FileSpreadsheet className={iconCls} />,
    },
    {
      title: "Configurações",
      href: "/admin/configuracoes",
      description: "Boas-vindas, RAG e integrações",
      icon: <Settings2 className={iconCls} />,
    },
    ...(isAdmin
      ? [
          {
            title: "Auditoria",
            href: "/admin/auditoria",
            description: "Histórico de ações",
            icon: <ScrollText className={iconCls} />,
          },
          {
            title: "Apartamentos",
            href: "/admin/apartamentos",
            description: "Mapa das torres",
            icon: <Building2 className={iconCls} />,
          },
        ]
      : []),
  ];
}

function NavSection({
  label,
  links,
  pathname,
}: {
  label?: string;
  links: NavLink[];
  pathname: string;
}) {
  return (
    <div className="space-y-1">
      {label ? (
        <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-white/45">
          {label}
        </p>
      ) : null}
      <ul className="space-y-0.5">
        {links.map((link) => {
          const active = pathMatches(pathname, link.href);
          return (
            <li key={`${link.href}-${link.title}`}>
              <Link
                to={link.href}
                aria-current={active ? "page" : undefined}
                title={link.description}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-white/12 text-brand-gold"
                    : "text-white/75 hover:bg-white/8 hover:text-white",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                    active ? "bg-brand-gold/15 text-brand-gold" : "bg-white/8 text-white/80",
                  )}
                >
                  {link.icon}
                </span>
                <span className="min-w-0 truncate font-medium">{link.title}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Navegação lateral para viewports md+ — mesma lógica de modos exclusivos do tab bar mobile.
 */
export function DesktopSidebar() {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) return null;

  const staffMode = activeIsStaff(user.role);
  const isAdmin = activeIsAdmin(user.role);
  const homeHref = homePathForRole(user.role);
  const path = location.pathname;

  const primary = staffMode ? staffPrimary() : residentPrimary();
  const secondary = staffMode ? staffSecondary(isAdmin) : residentSecondary();

  return (
    <aside
      aria-label="Navegação principal"
      className="sticky top-0 z-40 hidden h-[100dvh] w-60 shrink-0 flex-col border-r border-brand-navy/80 bg-brand-navy text-white md:flex lg:w-64"
    >
      <div className="flex items-center gap-2.5 border-b border-white/10 px-4 py-4">
        <Link to={homeHref} className="flex min-w-0 items-center gap-2.5 font-semibold tracking-wide">
          <img src="/logo.png" alt="" className="h-9 w-9 shrink-0 rounded-full" />
          <span className="truncate text-brand-gold">Fantasy 2 Hub</span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <NavSection links={primary} pathname={path} />
        <NavSection
          label={staffMode ? "Administração" : "Mais"}
          links={secondary}
          pathname={path}
        />
      </nav>

      <div className="border-t border-white/10 px-4 py-3">
        <p className="truncate text-xs text-white/50">
          {staffMode ? "Modo administração" : "Modo morador"}
        </p>
      </div>
    </aside>
  );
}
