import { useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

type GroupInviteActionsProps = {
  url: string | null;
  missingLabel: string;
  /** Disparado ao abrir o convite (não ao copiar). */
  onOpen?: () => void;
  openLabel?: string;
};

export function GroupInviteActions({
  url,
  missingLabel,
  onOpen,
  openLabel = "Abrir convite",
}: GroupInviteActionsProps) {
  const [copied, setCopied] = useState(false);

  if (!url) {
    return <p className="text-sm text-muted-foreground">{missingLabel}</p>;
  }

  async function copy() {
    await navigator.clipboard.writeText(url!);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm">
        <a href={url} target="_blank" rel="noopener noreferrer" onClick={() => onOpen?.()}>
          <ExternalLink className="h-3.5 w-3.5" />
          {openLabel}
        </a>
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={copy}>
        <Copy className="h-3.5 w-3.5" />
        {copied ? "Copiado" : "Copiar link"}
      </Button>
    </div>
  );
}
