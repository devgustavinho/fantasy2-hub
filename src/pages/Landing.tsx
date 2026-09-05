import { Link, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";

// Só é renderizada quando ninguém está logado — é o ProtectedRoute que decide isso pra "/"
// (mostra <Landing /> em vez de já mandar pro /login). O redirect aqui embaixo é redundância de
// segurança, caso esta página um dia passe a ser alcançável por outro caminho.
export default function Landing() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-brand-navy px-4 py-12 text-white">
      <div className="mx-auto flex max-w-md flex-col items-center gap-6 text-center">
        <img src="/logo.png" alt="Fantasy 2" className="h-24 w-24" />
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-brand-gold">Fantasy 2 Hub</h1>
          <p className="text-white/80">
            Espaço da comunidade de moradores do condomínio Fantasy 2: pautas de assembleia,
            recomendações de serviços entre vizinhos e avisos da administração.
          </p>
        </div>

        <div className="w-full max-w-xs space-y-3">
          <Button asChild size="lg" className="w-full">
            <Link to="/login">Entrar</Link>
          </Button>
          <p className="text-sm text-white/70">
            Ainda não tem conta?{" "}
            <Link to="/register" className="font-medium text-brand-gold underline">
              Cadastre seu apartamento
            </Link>
          </p>
        </div>
      </div>

      <Card className="mx-auto mt-10 max-w-md border-white/10 bg-white/5 text-left text-white">
        <CardHeader>
          <CardTitle className="text-base">Sobre este site</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-white/80">
          <p>
            O Fantasy 2 Hub é um projeto independente, criado e mantido por moradores do próprio
            condomínio — não é um serviço oficial da administração nem de nenhuma empresa.
          </p>
          <p className="font-medium text-white">
            Este site não tem nenhuma relação com a construtora Fan Construções, nem com as marcas
            Fan ou Fantasy.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
