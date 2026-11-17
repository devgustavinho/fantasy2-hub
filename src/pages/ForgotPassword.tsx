import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GradientBorderCard } from "@/components/ui/gradient-border-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import * as authService from "@/services/auth";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authService.requestPasswordReset(email);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar o e-mail.");
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
            {done ? (
              <>
                <CardHeader>
                  <CardTitle>Confira seu e-mail</CardTitle>
                  <CardDescription>
                    Se existir uma conta aprovada com esse e-mail, mandamos um link pra redefinir a
                    senha. O link vale por 1 hora.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button asChild className="w-full">
                    <Link to="/login">Voltar pro login</Link>
                  </Button>
                  <button
                    type="button"
                    className="w-full text-center text-xs text-muted-foreground underline"
                    onClick={() => {
                      setDone(false);
                      setEmail("");
                    }}
                  >
                    Usar outro e-mail
                  </button>
                </CardContent>
              </>
            ) : (
              <>
                <CardHeader>
                  <CardTitle>Esqueci minha senha</CardTitle>
                  <CardDescription>
                    Informe o e-mail da sua conta. Se estiver cadastrado e aprovado, você recebe um
                    link pra escolher uma senha nova.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-4">
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
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? "Enviando..." : "Enviar link"}
                    </Button>
                  </form>
                  <p className="mt-4 text-center text-sm text-muted-foreground">
                    <Link to="/login" className="font-medium text-primary underline">
                      Voltar pro login
                    </Link>
                  </p>
                </CardContent>
              </>
            )}
          </Card>
        </GradientBorderCard>
      </div>
    </div>
  );
}
