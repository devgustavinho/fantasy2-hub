import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

// Modo leitura: `value` pode vir fracionário (média) — preenche cada estrela proporcionalmente
// via `clipPath`. Modo interativo (`onChange`): sempre um número inteiro de 1 a 5.
export function StarRating({
  value,
  onChange,
  size = "md",
}: {
  value: number;
  onChange?: (stars: number) => void;
  size?: "sm" | "md" | "lg";
}) {
  const dimension = size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-6 w-6" : "h-4 w-4";
  const interactive = Boolean(onChange);

  return (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = Math.max(0, Math.min(1, value - (star - 1))) * 100;
        return (
          <button
            key={star}
            type="button"
            disabled={!interactive}
            onClick={() => onChange?.(star)}
            className={cn(
              "relative",
              interactive ? "cursor-pointer" : "cursor-default",
              dimension,
            )}
            aria-label={`${star} estrela${star > 1 ? "s" : ""}`}
          >
            <Star className={cn(dimension, "absolute inset-0 text-muted-foreground/30")} />
            <div className="absolute inset-0 overflow-hidden" style={{ width: `${fill}%` }}>
              <Star className={cn(dimension, "fill-brand-gold text-brand-gold")} />
            </div>
          </button>
        );
      })}
    </div>
  );
}
