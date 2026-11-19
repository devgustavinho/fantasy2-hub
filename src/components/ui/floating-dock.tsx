import { useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform, type MotionValue } from "framer-motion";
import { cn } from "@/lib/utils";

export interface FloatingDockItem {
  title: string;
  icon: ReactNode;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  badge?: number;
}

// Sempre horizontal e aberto (mesmo no celular) — nada de esconder atrás de um botão de menu.
// No mobile o dock fica compacto (ícones fixos); o efeito de magnify fica só em ponteiro fino.
export function FloatingDock({ items, className }: { items: FloatingDockItem[]; className?: string }) {
  const mouseX = useMotionValue(Infinity);
  return (
    <motion.div
      onMouseMove={(e) => mouseX.set(e.pageX)}
      onMouseLeave={() => mouseX.set(Infinity)}
      className={cn(
        "mx-auto flex h-12 max-w-full items-end gap-1.5 overflow-x-auto rounded-2xl bg-brand-navy/95 px-2 pb-1.5 backdrop-blur [scrollbar-width:none] sm:h-14 sm:gap-3 sm:overflow-visible sm:px-3 sm:pb-2 [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {items.map((item) => (
        <IconContainer mouseX={mouseX} key={item.title} {...item} />
      ))}
    </motion.div>
  );
}

function IconContainer({
  mouseX,
  title,
  icon,
  href,
  onClick,
  active,
  badge,
}: FloatingDockItem & { mouseX: MotionValue }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);

  const distance = useTransform(mouseX, (val) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - bounds.x - bounds.width / 2;
  });

  const widthTransform = useTransform(distance, [-150, 0, 150], [36, 56, 36]);
  const heightTransform = useTransform(distance, [-150, 0, 150], [36, 56, 36]);
  const widthTransformIcon = useTransform(distance, [-150, 0, 150], [18, 26, 18]);
  const heightTransformIcon = useTransform(distance, [-150, 0, 150], [18, 26, 18]);

  const spring = { mass: 0.1, stiffness: 150, damping: 12 };
  const width = useSpring(widthTransform, spring);
  const height = useSpring(heightTransform, spring);
  const widthIcon = useSpring(widthTransformIcon, spring);
  const heightIcon = useSpring(heightTransformIcon, spring);

  const body = (
    <motion.div
      ref={ref}
      style={{ width, height }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "relative flex aspect-square h-9 w-9 shrink-0 items-center justify-center rounded-full text-white sm:h-auto sm:w-auto",
        active ? "bg-primary/90 hover:bg-primary" : "bg-white/10 hover:bg-white/20",
      )}
    >
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: 10, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 2, x: "-50%" }}
            className="pointer-events-none absolute -top-8 left-1/2 hidden w-fit whitespace-pre rounded-md border border-white/10 bg-brand-navy px-2 py-0.5 text-xs text-white shadow-md sm:block"
          >
            {title}
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div
        style={{ width: widthIcon, height: heightIcon }}
        className="flex h-[18px] w-[18px] items-center justify-center sm:h-auto sm:w-auto"
      >
        {icon}
      </motion.div>
      {!!badge && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
          {badge}
        </span>
      )}
    </motion.div>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label={title} className="shrink-0 appearance-none border-0 bg-transparent p-0">
        {body}
      </button>
    );
  }

  return (
    <Link to={href ?? "/"} className="shrink-0" aria-label={title}>
      {body}
    </Link>
  );
}
