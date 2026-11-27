import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export type TabBarItem = {
  title: string;
  /** Rótulo curto opcional (telas estreitas). Default = title. */
  shortTitle?: string;
  icon: ReactNode;
  href?: string;
  onClick?: () => void;
  active?: boolean;
};

/**
 * Tab bar mobile: barra edge-to-edge, ícone + texto, sem float.
 * Fica como irmã do `<main>` no shell (`h-[100dvh]`) — `shrink-0`, não sticky/fixed.
 * O conteúdo rola no main; a barra permanece visível com safe-area.
 */
export function TabBar({ items, className }: { items: TabBarItem[]; className?: string }) {
  return (
    <nav
      aria-label="Navegação principal"
      className={cn(
        "z-30 w-full shrink-0 border-t border-brand-navy/80 bg-brand-navy text-white [padding-bottom:env(safe-area-inset-bottom,0px)]",
        className,
      )}
    >
      <ul className="mx-auto flex max-w-4xl items-stretch md:max-w-none">
        {items.map((item) => (
          <li key={item.title} className="min-w-0 flex-1">
            <TabButton {...item} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function TabButton({ title, shortTitle, icon, href, onClick, active }: TabBarItem) {
  const className = cn(
    "flex h-14 w-full flex-col items-center justify-center gap-0.5 px-0.5 text-center transition-colors",
    active ? "text-brand-gold" : "text-white/70 hover:text-white",
  );

  const body = (
    <>
      <span className={cn("flex h-5 w-5 items-center justify-center", active && "text-brand-gold")}>
        {icon}
      </span>
      <span className="max-w-full truncate text-[10px] font-medium leading-tight sm:text-xs">
        {shortTitle ? (
          <>
            <span className="sm:hidden">{shortTitle}</span>
            <span className="hidden sm:inline">{title}</span>
          </>
        ) : (
          title
        )}
      </span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={title}
        aria-current={active ? "page" : undefined}
        className={className}
      >
        {body}
      </button>
    );
  }

  return (
    <Link to={href ?? "/"} aria-label={title} aria-current={active ? "page" : undefined} className={className}>
      {body}
    </Link>
  );
}
