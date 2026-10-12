import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { QueryError } from "@/components/QueryError";
import { Markdown } from "@/components/Markdown";
import { useAuth } from "@/contexts/AuthContext";
import * as welcomeService from "@/services/welcome";

export default function Welcome() {
  const { user } = useAuth();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["welcome"],
    queryFn: welcomeService.getWelcome,
  });

  useEffect(() => {
    document.title = data?.title ? `${data.title} — Fantasy 2` : "Fantasy 2";
    return () => {
      document.title = "Fantasy 2 Hub";
    };
  }, [data?.title]);

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="bg-brand-navy px-4 py-6 text-white">
        <div className="mx-auto flex max-w-2xl items-center gap-4">
          <img src="/logo.png" alt="" className="h-14 w-14 rounded-full bg-white/10" />
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-brand-gold">Fantasy 2</p>
            <h1 className="text-2xl font-bold leading-tight">{data?.title ?? "Boas-vindas"}</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        {isLoading && <p className="text-muted-foreground">Carregando...</p>}
        {isError && <QueryError onRetry={() => refetch()} />}
        {data && (
          <article className="rounded-2xl border bg-card p-5 shadow-sm">
            <Markdown size="lg">{data.body}</Markdown>
          </article>
        )}

        <footer className="mt-8 flex flex-col items-center gap-2 pb-8 text-center text-sm text-muted-foreground">
          <Link to="/login" className="font-medium text-primary underline">
            Área do morador
          </Link>
          {user?.role === "admin" && (
            <Link to="/admin/boas-vindas" className="underline">
              Editar esta página
            </Link>
          )}
        </footer>
      </main>
    </div>
  );
}
