import type { ReactNode } from "react";

/** Link de navegação (sidebar / sheets). */
export type NavLink = {
  title: string;
  href: string;
  description: string;
  icon: ReactNode;
};

export function pathMatches(pathname: string, href: string): boolean {
  // `/admin` e `/` são prefixos — só marca ativo em match exato.
  if (href === "/admin" || href === "/") {
    return pathname === href;
  }
  // Alias legado de Negócios.
  if (href === "/negocios") {
    return (
      pathname === "/negocios" ||
      pathname.startsWith("/negocios/") ||
      pathname === "/servicos" ||
      pathname.startsWith("/servicos/")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function anyPathMatches(pathname: string, hrefs: string[]): boolean {
  return hrefs.some((href) => pathMatches(pathname, href));
}
