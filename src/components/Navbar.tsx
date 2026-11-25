import { useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Building2,
  ClipboardList,
  Clock,
  Columns3,
  Ellipsis,
  FileSpreadsheet,
  Gauge,
  HelpCircle,
  Home,
  LayoutDashboard,
  Lightbulb,
  MessageCircleQuestion,
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
import { roleLabel, userRoles } from "@/lib/roles";

export function TopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  if (!user) return null;

  const roles = userRoles(user);
  const multiRole = roles.length > 1;

  return (
    <header className="border-b border-brand-navy/60 bg-brand-navy text-white shadow-sm">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
        <Link to="/" className="flex min-w-0 items-center gap-2 font-semibold tracking-wide">
          <img src="/logo.png" alt="Fantasy 2" className="h-9 w-9 shrink-0 rounded-full" />
          <span className="hidden truncate text-brand-gold sm:inline">Fantasy 2 Hub</span>
        </Link>
        <div className="flex shrink-0 items-center gap-2 text-sm sm:gap-3">
          {multiRole && (
            <Link
              to="/perfil"
              className="max-w-[7.5rem] truncate rounded-full border border-brand-gold/40 bg-white/10 px-2.5 py-1 text-xs text-brand-gold transition-colors hover:bg-white/15"
              title="Trocar modo de visualização"
            >
              {roleLabel(user.role)}
            </Link>
          )}
          <NotificationBell />
          <Link
            to="/perfil"
            aria-label="Perfil"
            className="flex items-center gap-1.5 text-white/70 transition-colors hover:text-brand-gold"
          >
            <User className="h-5 w-5 sm:hidden" />
            <span className="hidden max-w-[10rem] truncate sm:inline">{user.name}</span>
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
  const [moreOpen, setMoreOpen] = useState(false);

  if (!user) return null;

  const isStaff = user.role === "admin" || user.role === "sindico";
  const isAdmin = user.role === "admin";
  const onAdminRoute = location.pathname.startsWith("/admin");

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
      description: "Áreas comuns, mudanças, convivência e documentos",
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
      description: "Balancetes e pareceres do conselho",
    },
  ];

  const moreHrefs = moreLinks.map((l) => l.href);
  const onMoreRoute = moreHrefs.some(
    (href) => location.pathname === href || location.pathname.startsWith(`${href}/`),
  );

  // Dock enxuto no celular: atalhos principais + "Mais" (sheet) + Admin (staff).
  // Evita 9–10 ícones estourando ~390px de largura.
  const items: FloatingDockItem[] = [
    { title: "Início", icon: <Home className="h-full w-full" />, href: "/" },
    { title: "Pautas", icon: <ClipboardList className="h-full w-full" />, href: "/pautas" },
    { title: "Negócios", icon: <ShoppingBag className="h-full w-full" />, href: "/negocios" },
    { title: "Perguntar", icon: <MessageCircleQuestion className="h-full w-full" />, href: "/perguntar" },
    {
      title: "Mais",
      icon: <Ellipsis className="h-full w-full" />,
      onClick: () => setMoreOpen(true),
      active: onMoreRoute || moreOpen,
    },
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

  const adminLinks: SheetLink[] = [
    {
      title: "Painel",
      href: "/admin",
      icon: <LayoutDashboard className="h-5 w-5" />,
      description: "Pautas por engajamento e acessos",
    },
    {
      title: "Índice RAG",
      href: "/perguntar",
      icon: <MessageCircleQuestion className="h-5 w-5" />,
      description: isAdmin ? "Provedor, chave e reindexação" : "Status do índice e reindexação",
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

  function goTo(href: string, close: () => void) {
    close();
    navigate(href);
  }

  function renderSheetLinks(links: SheetLink[], close: () => void) {
    return (
      <ul className="space-y-1">
        {links.map((link) => {
          const active =
            location.pathname === link.href || location.pathname.startsWith(`${link.href}/`);
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
    <>
      <div className="sticky bottom-4 z-30 mt-6 flex w-full max-w-full justify-center px-3 [padding-bottom:env(safe-area-inset-bottom)] sm:px-4">
        <FloatingDock items={items} className="max-w-full" />
      </div>

      <BottomSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="Mais"
        description="Outras áreas do condomínio."
      >
        {renderSheetLinks(moreLinks, () => setMoreOpen(false))}
      </BottomSheet>

      <BottomSheet
        open={adminOpen}
        onClose={() => setAdminOpen(false)}
        title="Administração"
        description="Atalhos do painel — pensado para o celular."
      >
        {renderSheetLinks(adminLinks, () => setAdminOpen(false))}
      </BottomSheet>
    </>
  );
}
