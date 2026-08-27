import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GradientBorderCard } from "@/components/ui/gradient-border-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import * as authService from "@/services/auth";
import * as webauthnService from "@/services/webauthn";
import { setToken } from "@/lib/api";
import type { LoginResult } from "@/lib/types";

type View =
  | { name: "email" }
  | { name: "biometric"; email: string }
  | { name: "password"; email: string }
  | { name: "totp-setup"; token: string; qrDataUrl: string }
  | { name: "totp-verify"; token: string };

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [view, setView] = useState<View>({ name: "email" });
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = (location.state as { from?: string } | null)?.from || "/";
  const supportsBiometric = browserSupportsWebAuthn();

  function handleResult(result: LoginResult) {
    if (result.status === "ok") {
      setToken(result.token);
      setUser(result.user);
      navigate(redirectTo, { replace: true });
    } else if (result.status === "totp-setup-required") {
      setView({ name: "totp-setup", token: result.token, qrDataUrl: result.qrDataUrl });
    } else if (result.status === "totp-verify-required") {
      setView({ name: "totp-verify", token: result.token });
    }
  }

  // Passo 1: só o e-mail. Se a conta já tiver passkey cadastrada neste navegador/celular, já
  // dispara o prompt de biometria na hora — sem nem pedir a senha. Só cai pro campo de senha se
  // não tiver passkey (ou se a pessoa cancelar a biometria).
  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    setCheckingEmail(true);

    let optionsJSON: PublicKeyCredentialRequestOptionsJSON | null = null;
    if (supportsBiometric) {
      try {
        optionsJSON = await webauthnService.getLoginOptions(email);
      } catch {
        optionsJSON = null;
      }
    }
    setCheckingEmail(false);

    if (!optionsJSON) {
      setView({ name: "password", email });
      return;
    }

    setView({ name: "biometric", email });
    setBiometricLoading(true);
    try {
      handleResult(await webauthnService.verifyLogin(email, optionsJSON));
    } catch {
      setError("Não foi possível confirmar a biometria. Digite sua senha.");
      setView({ name: "password", email });
    } finally {
      setBiometricLoading(false);
    }
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      handleResult(await authService.login({ email, password }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao entrar.");
    } finally {
      setLoading(false);
    }
  }

  async function handleTotpSubmit(e: FormEvent, mode: "setup" | "verify", token: string) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result =
        mode === "setup"
          ? await authService.confirmTotpSetup(token, code)
          : await authService.verifyTotp(token, code);
      handleResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Código inválido.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-navy px-4">
      <div className="w-full max-w-sm space-y-6">
        <img src="/logo.png" alt="Fantasy 2" className="mx-auto h-20 w-20" />
        <GradientBorderCard>
          <Card className="border-none shadow-none">
            {view.name === "email" && (
              <>
                <CardHeader>
                  <CardTitle>Entrar</CardTitle>
                  <CardDescription>Acesse o hub do condomínio Fantasy 2.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleEmailSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">E-mail</Label>
                      <Input
                        id="email"
                        type="email"
                        required
                        autoFocus
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <Button type="submit" className="w-full" disabled={checkingEmail}>
                      {checkingEmail ? "Verificando..." : "Continuar"}
                    </Button>
                  </form>

                  <p className="mt-4 text-center text-sm text-muted-foreground">
                    Ainda não tem conta?{" "}
                    <Link to="/register" className="font-medium text-primary underline">
                      Cadastre seu apartamento
                    </Link>
                  </p>
                </CardContent>
              </>
            )}

            {view.name === "biometric" && (
              <>
                <CardHeader>
                  <CardTitle>Confirme sua biometria</CardTitle>
                  <CardDescription>{view.email}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col items-center gap-3 py-4 text-center">
                    <Fingerprint className="h-12 w-12 animate-pulse text-primary" />
                    <p className="text-sm text-muted-foreground">
                      {biometricLoading ? "Aguardando confirmação..." : "Confirme no seu aparelho."}
                    </p>
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setError(null);
                      setView({ name: "password", email: view.email });
                    }}
                  >
                    Usar senha em vez disso
                  </Button>
                </CardContent>
              </>
            )}

            {view.name === "password" && (
              <>
                <CardHeader>
                  <CardTitle>Entrar</CardTitle>
                  <CardDescription>{view.email}</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handlePasswordSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="password">Senha</Label>
                      <Input
                        id="password"
                        type="password"
                        required
                        autoFocus
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? "Entrando..." : "Entrar"}
                    </Button>
                    <button
                      type="button"
                      className="w-full text-center text-xs text-muted-foreground underline"
                      onClick={() => {
                        setError(null);
                        setPassword("");
                        setView({ name: "email" });
                      }}
                    >
                      Trocar e-mail
                    </button>
                  </form>
                </CardContent>
              </>
            )}

            {view.name === "totp-setup" && (
              <>
                <CardHeader>
                  <CardTitle>Configurar autenticação em duas etapas</CardTitle>
                  <CardDescription>
                    Contas de administrador exigem 2FA. Escaneie o QR code com o Google Authenticator
                    (ou similar) e digite o código de 6 dígitos gerado.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <img src={view.qrDataUrl} alt="QR code do 2FA" className="mx-auto h-48 w-48" />
                  <form onSubmit={(e) => handleTotpSubmit(e, "setup", view.token)} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="code">Código</Label>
                      <Input
                        id="code"
                        inputMode="numeric"
                        maxLength={6}
                        required
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                      />
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? "Confirmando..." : "Confirmar e ativar"}
                    </Button>
                  </form>
                </CardContent>
              </>
            )}

            {view.name === "totp-verify" && (
              <>
                <CardHeader>
                  <CardTitle>Autenticação em duas etapas</CardTitle>
                  <CardDescription>Digite o código de 6 dígitos do seu app autenticador.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <form onSubmit={(e) => handleTotpSubmit(e, "verify", view.token)} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="code">Código</Label>
                      <Input
                        id="code"
                        inputMode="numeric"
                        maxLength={6}
                        required
                        autoFocus
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                      />
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? "Verificando..." : "Entrar"}
                    </Button>
                  </form>
                </CardContent>
              </>
            )}
          </Card>
        </GradientBorderCard>
      </div>
    </div>
  );
}
