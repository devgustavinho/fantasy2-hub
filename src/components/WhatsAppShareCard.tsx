import { resolveMediaUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  description?: string | null;
  imagePath?: string | null;
  /** URL completa do link curto (ex. https://…/n/DocesDaAna). */
  url?: string | null;
  className?: string;
};

/** Preview estático do card que o WhatsApp mostra ao colar o link. */
export function WhatsAppShareCard({ title, description, imagePath, url, className }: Props) {
  const host = url ? safeHost(url) : "fantasy2-hub.pages.dev";
  const hasImage = Boolean(imagePath);

  return (
    <div className={cn("overflow-hidden rounded-md border bg-muted/20", className)}>
      <div className="border-b bg-[#0b141a] px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-white/70">
        Preview no WhatsApp
      </div>
      {hasImage ? (
        <div className="aspect-[1.91/1] w-full overflow-hidden bg-muted">
          <img
            src={previewSrc(imagePath!)}
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="flex aspect-[1.91/1] w-full items-center justify-center bg-muted/60 px-4 text-center text-xs text-muted-foreground">
          Sem capa — o WhatsApp mostra só o logo genérico do hub (ou nada).
        </div>
      )}
      <div className="space-y-0.5 bg-[#111b21] px-3 py-2 text-white">
        <p className="truncate text-[10px] uppercase tracking-wide text-white/50">{host}</p>
        <p className="line-clamp-2 text-sm font-medium leading-snug">{title || "Nome do negócio"}</p>
        {description?.trim() ? (
          <p className="line-clamp-2 text-xs text-white/60">{description.trim()}</p>
        ) : (
          <p className="text-xs text-white/40">Adicione uma descrição curta pra aparecer aqui.</p>
        )}
      </div>
    </div>
  );
}

function previewSrc(path: string) {
  if (/^(https?:|blob:|data:)/i.test(path)) return path;
  return resolveMediaUrl(path);
}

function safeHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return "fantasy2-hub.pages.dev";
  }
}
