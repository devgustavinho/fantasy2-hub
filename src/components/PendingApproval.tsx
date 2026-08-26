import { Button } from "@/components/ui/button";

export function PendingApproval({
  status,
  actionLabel = "Sair",
  onAction,
}: {
  status: "pending" | "rejected";
  actionLabel?: string;
  onAction: () => void;
}) {
  return (
    <div className="space-y-3 text-center">
      <h2 className="text-lg font-semibold">
        {status === "pending" ? "Cadastro em análise" : "Cadastro recusado"}
      </h2>
      <p className="text-sm text-muted-foreground">
        {status === "pending"
          ? "Sua conta ainda está aguardando aprovação da administração do condomínio. Você recebe acesso assim que for aprovado."
          : "A administração do condomínio recusou este cadastro. Se acha que houve engano, entre em contato com a administração."}
      </p>
      <Button variant="outline" size="sm" onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  );
}
