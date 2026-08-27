import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GradientBorderCard } from "@/components/ui/gradient-border-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import * as authService from "@/services/auth";
import * as webauthnService from "@/services/webauthn";
import type { LoginResult } from "@/lib/types";

type View =
  | { name: "credentials" }
  | { name: "totp-setup"; token: string; qrDataUrl: string }
  | { name: "totp-verify"; token: string };

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [view, setView] = useState<View>({ name: "credentials" });
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const supportsBiometric = browserSupportsWebAuthn();

  function handleResult(result: LoginResult) {
    if (result.status === "ok") {
      setUser(result.user);
      navigate("/");
    } else if (result.status === "totp-setup-required") {
      setView({ name: "totp-setup", token: result.token, qrDataUrl: result.qrDataUrl });
    } else if (result.status === "totp-verify-required") {
      setView({ name: "totp-verify", token: result.token });
    }
  }

  async function handleSubmit(e: FormEvent) {
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

  async function handleBiometricLogin() {
    if (!email) {
      setError("Digite seu e-mail para entrar com biometria.");
      return;
    }
    setError(null);
    setBiometricLoading(true);
    try {
      handleResult(await webauthnService.loginWithPasskey(email));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao entrar com biometria.");
    } finally {
      setBiometricLoading(false);
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
            {view.name === "credentials" && (
              <>
                <CardHeader>
                  <CardTitle>Entrar</CardTitle>
                  <CardDescription>Acesse o hub do condomínio Fantasy 2.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">E-mail</Label>
                      <Input
                        id="email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Senha</Label>
                      <Input
                        id="password"
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? "Entrando..." : "Entrar"}
                    </Button>
                  </form>

                  {supportsBiometric && (
                    <>
                      <div className="my-4 flex items-center gap-2 text-xs text-muted-foreground">
                        <div className="h-px flex-1 bg-border" />
                        ou
                        <div className="h-px flex-1 bg-border" />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        disabled={biometricLoading}
                        onClick={handleBiometricLogin}
                      >
                        {biometricLoading ? "Verificando..." : "Entrar com biometria"}
                      </Button>
                    </>
                  )}

                  <p className="mt-4 text-center text-sm text-muted-foreground">
                    Ainda não tem conta?{" "}
                    <Link to="/register" className="font-medium text-primary underline">
                      Cadastre seu apartamento
                    </Link>
                  </p>
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
