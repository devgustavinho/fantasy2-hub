import { Button } from "@/components/ui/button";

// Sem isso, uma query que falha (rede, sessão expirada, CORS) deixa `data` undefined pra sempre —
// como as páginas de lista só renderizam algo quando têm `data`, o resultado é uma tela em branco
// sem nenhuma pista do que aconteceu (foi assim que passou despercebido no Safari do iPhone).
export function QueryError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm">
      <p className="text-destructive">Não foi possível carregar os dados. Verifique sua conexão.</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Tentar novamente
      </Button>
    </div>
  );
}
