import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { Monitor, Moon, Sun } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import * as webauthnService from "@/services/webauthn";
import * as pushService from "@/services/push";
import * as authService from "@/services/auth";
import { AdvancedSettingsCard } from "@/components/AdvancedSettingsCard";
import { hasNativeInstallPrompt, isRunningStandalone, triggerNativeInstallPrompt } from "@/lib/installPrompt";
import { cn } from "@/lib/utils";
import {
  hasAnyPrivilegedRole,
  needsTotpSetup,
  roleBadgeVariant,
  roleLabel,
  roleRequires2fa,
  userRoles,
} from "@/lib/roles";
import type { Role } from "@/lib/types";
import { ApiError } from "@/lib/api";

export default function Profile() {
  const { user, setUser } = useAuth();
  const { preference, setPreference } = useTheme();
  const queryClient = useQueryClient();
  const [whatsapp, setWhatsapp] = useState(user?.whatsapp ?? "");
  const [whatsappVisible, setWhatsappVisible] = useState(user?.whatsappVisible ?? false);
  const [whatsappSaved, setWhatsappSaved] = useState(false);

  const canInviteFamily = user?.householdRole === "owner" && !!user.apartmentId;
  const { data: familyData } = useQuery({
    queryKey: ["family-member"],
    queryFn: authService.getFamilyMember,
    enabled: canInviteFamily,
  });
  const [familyName, setFamilyName] = useState("");
  const [familyEmail, setFamilyEmail] = useState("");
  const [familyPassword, setFamilyPassword] = useState("");
  const [familyError, setFamilyError] = useState<string | null>(null);

  const inviteFamilyMutation = useMutation({
    mutationFn: () => authService.inviteFamilyMember({ name: familyName, email: familyEmail, password: familyPassword }),
    onSuccess: () => {
      setFamilyError(null);
      setFamilyName("");
      setFamilyEmail("");
      setFamilyPassword("");
      queryClient.invalidateQueries({ queryKey: ["family-member"] });
    },
    onError: (err) => setFamilyError(err instanceof Error ? err.message : "Erro ao convidar familiar."),
  });

  const whatsappMutation = useMutation({
    mutationFn: () => authService.updateMyProfile({ whatsapp: whatsapp.trim() || null, whatsappVisible }),
    onSuccess: ({ user }) => {
      setUser(user);
      setWhatsappSaved(true);
      setTimeout(() => setWhatsappSaved(false), 2500);
    },
  });
  const [deviceName, setDeviceName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const supported = browserSupportsWebAuthn();

  const [standalone] = useState(isRunningStandalone);
  const [installHelp, setInstallHelp] = useState(false);
  async function handleInstallClick() {
    if (hasNativeInstallPrompt()) {
      await triggerNativeInstallPrompt();
    } else {
      setInstallHelp((v) => !v);
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ["passkeys"],
    queryFn: webauthnService.listPasskeys,
  });

  const registerMutation = useMutation({
    mutationFn: () => webauthnService.registerPasskey(deviceName || undefined),
    onSuccess: () => {
      setDeviceName("");
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["passkeys"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Erro ao cadastrar passkey."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => webauthnService.deletePasskey(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["passkeys"] }),
  });

  const pushSupported = pushService.supportsPush();
  const [pushError, setPushError] = useState<string | null>(null);
  const { data: pushSubscription, isLoading: pushLoading } = useQuery({
    queryKey: ["push-subscription"],
    queryFn: pushService.getCurrentPushSubscription,
    enabled: pushSupported,
  });

  const enablePushMutation = useMutation({
    mutationFn: pushService.enablePush,
    onSuccess: () => {
      setPushError(null);
      queryClient.invalidateQueries({ queryKey: ["push-subscription"] });
    },
    onError: (err) => setPushError(err instanceof Error ? err.message : "Erro ao ativar notificações."),
  });

  const disablePushMutation = useMutation({
    mutationFn: pushService.disablePush,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["push-subscription"] }),
  });

  const [roleSwitchError, setRoleSwitchError] = useState<string | null>(null);
  const [totpOpen, setTotpOpen] = useState(false);
  const [totpQr, setTotpQr] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpError, setTotpError] = useState<string | null>(null);

  const startTotpMutation = useMutation({
    mutationFn: authService.startSessionTotpSetup,
    onSuccess: (data) => {
      setTotpError(null);
      setTotpQr(data.qrDataUrl);
      setTotpOpen(true);
    },
    onError: (err) => setTotpError(err instanceof Error ? err.message : "Erro ao iniciar 2FA."),
  });

  const confirmTotpMutation = useMutation({
    mutationFn: () => authService.confirmSessionTotpSetup(totpCode),
    onSuccess: ({ user: next }) => {
      setUser(next);
      setTotpCode("");
      setTotpQr(null);
      setTotpOpen(false);
      setTotpError(null);
    },
    onError: (err) => setTotpError(err instanceof Error ? err.message : "Código inválido."),
  });

  const activeRoleMutation = useMutation({
    mutationFn: (role: Role) => authService.setActiveRole(role),
    onSuccess: ({ user: next }) => {
      setRoleSwitchError(null);
      setUser(next);
    },
    onError: (err) => {
      setRoleSwitchError(err instanceof Error ? err.message : "Não foi possível trocar o modo.");
      if (err instanceof ApiError && err.code === "totp_required") {
        startTotpMutation.mutate();
      }
    },
  });

  function handleTotpConfirm(e: FormEvent) {
    e.preventDefault();
    confirmTotpMutation.mutate();
  }

  if (!user) return null;

  const assignedRoles = userRoles(user);
  const multiRole = assignedRoles.length > 1;
  const totpNeeded = needsTotpSetup(user);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">Perfil</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Minha conta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            <span className="text-muted-foreground">Nome:</span> {user.name}
          </p>
          <p>
            <span className="text-muted-foreground">E-mail:</span> {user.email}
          </p>
          <div className="space-y-2">
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">Cargos:</span>
              {assignedRoles.map((r) => (
                <Badge key={r} variant={roleBadgeVariant(r)}>
                  {roleLabel(r)}
                </Badge>
              ))}
              {user.householdRole === "family" && <Badge variant="secondary">Familiar</Badge>}
            </p>
            <p className="text-muted-foreground">
              Modo ativo: <strong className="text-foreground">{roleLabel(user.role)}</strong>
              {roleRequires2fa(user.role) ? " · ações privilegiadas" : " · visão de morador"}
            </p>
          </div>
        </CardContent>
      </Card>

      {multiRole && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Modo de visualização</CardTitle>
            <CardDescription>
              Troque o cargo ativo para ver o app como morador, conselheiro ou administração — sem
              perder os outros cargos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {assignedRoles.map((role) => (
                <button
                  key={role}
                  type="button"
                  disabled={activeRoleMutation.isPending || role === user.role}
                  onClick={() => activeRoleMutation.mutate(role)}
                  aria-pressed={role === user.role}
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
            {roleSwitchError && <p className="text-sm text-destructive">{roleSwitchError}</p>}
          </CardContent>
        </Card>
      )}

      {(totpNeeded || totpOpen || user.totpEnabled) && hasAnyPrivilegedRole(user) && (
        <Card className={totpNeeded ? "border-amber-500/50 bg-amber-500/5" : undefined}>
          <CardHeader>
            <CardTitle className="text-base">Autenticação em duas etapas</CardTitle>
            <CardDescription>
              {user.totpEnabled
                ? "2FA ativo. Obrigatório para conselheiro, síndico e administrador."
                : "Obrigatório para conselheiro, síndico e administrador. Configure antes de usar esses cargos."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!user.totpEnabled && !totpQr && (
              <Button
                onClick={() => startTotpMutation.mutate()}
                disabled={startTotpMutation.isPending}
              >
                {startTotpMutation.isPending ? "Gerando QR..." : "Configurar 2FA"}
              </Button>
            )}
            {totpQr && (
              <form onSubmit={handleTotpConfirm} className="space-y-3">
                <img src={totpQr} alt="QR code do 2FA" className="mx-auto h-48 w-48" />
                <div className="space-y-2">
                  <Label htmlFor="totp-code">Código de 6 dígitos</Label>
                  <Input
                    id="totp-code"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={confirmTotpMutation.isPending}>
                  {confirmTotpMutation.isPending ? "Confirmando..." : "Ativar 2FA"}
                </Button>
              </form>
            )}
            {totpError && <p className="text-sm text-destructive">{totpError}</p>}
            {user.totpEnabled && (
              <p className="text-sm text-muted-foreground">Status: ativo nesta conta.</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aparência</CardTitle>
          <CardDescription>
            Por padrão acompanha o tema do aparelho. Só grava neste aparelho se você escolher Claro
            ou Escuro.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-1.5 rounded-xl border bg-muted/40 p-1.5">
            {(
              [
                { value: "system" as const, label: "Sistema", icon: Monitor },
                { value: "light" as const, label: "Claro", icon: Sun },
                { value: "dark" as const, label: "Escuro", icon: Moon },
              ] as const
            ).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setPreference(value)}
                aria-pressed={preference === value}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-sm font-medium transition-colors",
                  preference === value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-background/80 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {!standalone && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Instalar aplicativo</CardTitle>
            <CardDescription>
              Adicione o Fantasy 2 Hub na tela inicial do seu celular pra abrir como um app, mais
              rápido e sem a barra de endereço.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {installHelp && (
              <p className="text-sm text-muted-foreground">
                No iPhone: toque em Compartilhar e depois em "Adicionar à Tela de Início". No
                Android: toque no menu (⋮) do navegador e em "Instalar aplicativo" ou "Adicionar à
                tela inicial".
              </p>
            )}
            <Button size="sm" onClick={handleInstallClick}>
              Instalar
            </Button>
          </CardContent>
        </Card>
      )}

      {canInviteFamily && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Família</CardTitle>
            <CardDescription>
              Convide 1 familiar para ter o próprio login. Ele pode ver tudo e comentar, mas não vota —
              o voto continua sendo 1 por apartamento.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {familyData?.familyMember ? (
              <div className="rounded-md border p-3 text-sm">
                <p className="font-medium">{familyData.familyMember.name}</p>
                <p className="text-muted-foreground">{familyData.familyMember.email}</p>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!familyName.trim() || !familyEmail.trim() || familyPassword.length < 8) {
                    setFamilyError("Preencha nome, e-mail e uma senha com pelo menos 8 caracteres.");
                    return;
                  }
                  inviteFamilyMutation.mutate();
                }}
                className="space-y-3"
              >
                <div className="space-y-2">
                  <Label htmlFor="familyName">Nome</Label>
                  <Input id="familyName" value={familyName} onChange={(e) => setFamilyName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="familyEmail">E-mail</Label>
                  <Input
                    id="familyEmail"
                    type="email"
                    value={familyEmail}
                    onChange={(e) => setFamilyEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="familyPassword">Senha</Label>
                  <Input
                    id="familyPassword"
                    type="password"
                    value={familyPassword}
                    onChange={(e) => setFamilyPassword(e.target.value)}
                  />
                </div>
                {familyError && <p className="text-sm text-destructive">{familyError}</p>}
                <Button type="submit" size="sm" disabled={inviteFamilyMutation.isPending}>
                  {inviteFamilyMutation.isPending ? "Convidando..." : "Convidar familiar"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notificações push</CardTitle>
          <CardDescription>
            Receba um aviso neste aparelho quando alguém comentar, mudar o status ou responder numa
            pauta que você acompanha — mesmo com o site fechado. No iPhone, precisa primeiro "Adicionar
            à Tela de Início" pelo Safari.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!pushSupported && (
            <p className="text-sm text-muted-foreground">
              Este navegador não tem suporte a notificações push.
            </p>
          )}
          {pushSupported && pushLoading && (
            <p className="text-sm text-muted-foreground">Verificando...</p>
          )}
          {pushSupported && !pushLoading && (
            <>
              <p className="text-sm">
                Status neste aparelho:{" "}
                <strong>{pushSubscription ? "ativadas" : "desativadas"}</strong>
              </p>
              {pushSubscription ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={disablePushMutation.isPending}
                  onClick={() => disablePushMutation.mutate()}
                >
                  Desativar neste aparelho
                </Button>
              ) : (
                <Button size="sm" disabled={enablePushMutation.isPending} onClick={() => enablePushMutation.mutate()}>
                  {enablePushMutation.isPending ? "Ativando..." : "Ativar notificações neste aparelho"}
                </Button>
              )}
              {pushError && <p className="text-sm text-destructive">{pushError}</p>}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">WhatsApp</CardTitle>
          <CardDescription>
            Opcional. Se preenchido e marcado como visível, outros moradores conseguem ver seu WhatsApp
            junto do seu nome nas pautas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="whatsapp">Número</Label>
            <Input
              id="whatsapp"
              placeholder="(11) 91234-5678"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={whatsappVisible}
              onChange={(e) => setWhatsappVisible(e.target.checked)}
            />
            Mostrar meu WhatsApp para outros moradores
          </label>
          <div className="flex items-center gap-3">
            <Button size="sm" disabled={whatsappMutation.isPending} onClick={() => whatsappMutation.mutate()}>
              {whatsappMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
            {whatsappSaved && <span className="text-sm text-muted-foreground">Salvo!</span>}
          </div>
        </CardContent>
      </Card>

      {/* Avançado: dispositivos + MCP remoto (Claude / Cursor / Antigravity). */}
      <AdvancedSettingsCard
        devices={
          <div className="space-y-4">
            {!supported && (
              <p className="text-sm text-muted-foreground">
                Este navegador não tem suporte a login por biometria.
              </p>
            )}

            {supported && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="deviceName">Nome do aparelho (opcional)</Label>
                  <Input
                    id="deviceName"
                    placeholder="Ex: Meu celular"
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                  />
                </div>
                <Button
                  onClick={() => registerMutation.mutate()}
                  disabled={registerMutation.isPending}
                >
                  {registerMutation.isPending
                    ? "Cadastrando..."
                    : "Cadastrar biometria neste aparelho"}
                </Button>
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="space-y-2">
              {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
              {data?.credentials.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-md border p-3 text-sm"
                >
                  <div>
                    <p className="font-medium">{c.deviceName || "Dispositivo sem nome"}</p>
                    <p className="text-xs text-muted-foreground">
                      Cadastrado em {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(c.id)}
                  >
                    Remover
                  </Button>
                </div>
              ))}
              {data && data.credentials.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum aparelho cadastrado ainda.</p>
              )}
            </div>
          </div>
        }
      />
    </div>
  );
}
