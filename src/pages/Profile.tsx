import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import * as webauthnService from "@/services/webauthn";
import * as pushService from "@/services/push";
import * as authService from "@/services/auth";
import type { Role } from "@/lib/types";

function roleLabel(role: Role) {
  if (role === "admin") return "Administrador";
  if (role === "sindico") return "Síndico";
  return "Morador";
}

export default function Profile() {
  const { user, setUser } = useAuth();
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

  if (!user) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">Perfil</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Minha conta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">Nome:</span> {user.name}
          </p>
          <p>
            <span className="text-muted-foreground">E-mail:</span> {user.email}
          </p>
          <p className="flex items-center gap-2">
            <span className="text-muted-foreground">Cargo:</span> <Badge variant="secondary">{roleLabel(user.role)}</Badge>
            {user.householdRole === "family" && <Badge variant="secondary">Familiar</Badge>}
          </p>
        </CardContent>
      </Card>

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
          <CardTitle className="text-base">Login por biometria</CardTitle>
          <CardDescription>
            Cadastre este aparelho para entrar com a digital ou reconhecimento facial, sem digitar a
            senha.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
                {registerMutation.isPending ? "Cadastrando..." : "Cadastrar biometria neste aparelho"}
              </Button>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="space-y-2">
            {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
            {data?.credentials.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
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
        </CardContent>
      </Card>

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
    </div>
  );
}
