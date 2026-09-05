import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GradientBorderCard } from "@/components/ui/gradient-border-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import * as authService from "@/services/auth";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await authService.confirmPasswordReset({ token, password });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível redefinir a senha.");
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
            {!token ? (
              <>
                <CardHeader>
                  <CardTitle>Link inválido</CardTitle>
                  <CardDescription>
                    Esse link não tem um token de redefinição. Peça um novo reset pra administração.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Link to="/login" className="text-sm font-medium text-primary underline">
                    Voltar pro login
                  </Link>
                </CardContent>
              </>
            ) : done ? (
              <>
                <CardHeader>
                  <CardTitle>Senha redefinida!</CardTitle>
                  <CardDescription>Já dá pra entrar com a senha nova.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild className="w-full">
                    <Link to="/login">Ir para o login</Link>
                  </Button>
                </CardContent>
              </>
            ) : (
              <>
                <CardHeader>
                  <CardTitle>Escolha uma senha nova</CardTitle>
                  <CardDescription>Mínimo de 8 caracteres.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="password">Senha nova</Label>
                      <Input
                        id="password"
                        type="password"
                        required
                        minLength={8}
                        autoFocus
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirme a senha nova</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        required
                        minLength={8}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? "Salvando..." : "Redefinir senha"}
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
