import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Sem isso, um erro de render em qualquer lugar da árvore derruba o React inteiro e deixa a
// tela em branco, sem nenhuma pista pro usuário do que aconteceu.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Erro não tratado na interface:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-brand-navy px-4 text-center text-white">
          <h1 className="text-lg font-semibold">Algo deu errado</h1>
          <p className="max-w-sm text-sm text-white/70">
            Ocorreu um erro inesperado nesta página. Tente recarregar — se o problema continuar, avise a
            administração do condomínio.
          </p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Recarregar
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
