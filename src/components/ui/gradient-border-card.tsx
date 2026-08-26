import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Cartão com borda em gradiente (rosa → dourado → ciano, cores da marca),
// no estilo "Background Gradient" da aceternity/ui — só CSS, sem framer-motion.
export function GradientBorderCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="relative">
      <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-brand-pink via-brand-gold to-brand-cyan opacity-70 blur-md" />
      <div className={cn("relative rounded-2xl bg-card", className)}>{children}</div>
    </div>
  );
}
