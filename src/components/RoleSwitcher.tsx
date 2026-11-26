import { useRef, useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/lib/api";
import { homePathForRole, roleLabel, userRoles } from "@/lib/roles";
import type { Role } from "@/lib/types";
import { cn } from "@/lib/utils";
import * as authService from "@/services/auth";

type SwitchHandlers = {
  navigateHome?: boolean;
  onTotpRequired?: () => void;
  onSwitched?: () => void;
};

export function useActiveRoleSwitch(handlers: SwitchHandlers = {}) {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const mutation = useMutation({
    mutationFn: (role: Role) => authService.setActiveRole(role),
    onSuccess: ({ user: next }) => {
      setError(null);
      setUser(next);
      const h = handlersRef.current;
      h.onSwitched?.();
      if (h.navigateHome !== false) {
        navigate(homePathForRole(next.role), { replace: true });
      }
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "totp_required") {
        setError("Configure a autenticação em duas etapas antes de usar este cargo.");
        handlersRef.current.onTotpRequired?.();
        return;
      }
      setError(err instanceof Error ? err.message : "Não foi possível trocar o modo.");
    },
  });

  return { mutation, error, setError };
}

export function RoleSwitcherButtons({
  className,
  navigateHome = true,
  onTotpRequired,
  onSwitched,
}: {
  className?: string;
  navigateHome?: boolean;
  onTotpRequired?: () => void;
  onSwitched?: () => void;
}) {
  const { user } = useAuth();
  const { mutation, error } = useActiveRoleSwitch({
    navigateHome,
    onTotpRequired,
    onSwitched,
  });

  if (!user) return null;

  const assigned = userRoles(user);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {assigned.map((role) => (
          <button
            key={role}
            type="button"
            disabled={mutation.isPending || role === user.role}
            aria-pressed={role === user.role}
            onClick={() => mutation.mutate(role)}
            className={cn(
              "rounded-xl border px-3 py-3 text-left text-sm font-medium transition-colors",
              role === user.role
                ? "border-brand-navy bg-brand-navy text-white"
                : "hover:bg-muted",
            )}
          >
            {roleLabel(role)}
            {role === user.role && (
              <span className="mt-0.5 block text-xs font-normal opacity-80">Ativo agora</span>
            )}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/**
 * Chip + sheet para trocar o modo de visualização (multi-role).
 * `variant="inline"` só renderiza os botões (Perfil).
 */
export function RoleSwitcher({
  trigger,
  open: openProp,
  onOpenChange,
  variant = "sheet",
  className,
  onTotpRequired,
}: {
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  variant?: "sheet" | "inline";
  className?: string;
  onTotpRequired?: () => void;
}) {
  const { user } = useAuth();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  if (!user) return null;

  const assigned = userRoles(user);
  if (assigned.length < 2 && variant === "sheet") return null;

  if (variant === "inline") {
    return <RoleSwitcherButtons className={className} onTotpRequired={onTotpRequired} />;
  }

  return (
    <>
      {trigger ?? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "max-w-[7.5rem] truncate rounded-full border border-brand-gold/40 bg-white/10 px-2.5 py-1 text-xs text-brand-gold transition-colors hover:bg-white/15",
            className,
          )}
          title="Trocar modo de visualização"
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          {roleLabel(user.role)}
        </button>
      )}
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Modo de visualização"
        description="Escolha como ver o app. Cada cargo tem navegação própria — sem misturar admin e morador."
      >
        <RoleSwitcherButtons
          onTotpRequired={onTotpRequired}
          onSwitched={() => setOpen(false)}
        />
      </BottomSheet>
    </>
  );
}
