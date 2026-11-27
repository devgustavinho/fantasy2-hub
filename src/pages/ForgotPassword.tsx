import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GradientBorderCard } from "@/components/ui/gradient-border-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import * as authService from "@/services/auth";
import { listApartmentsByTower } from "@/services/apartments";
import type { Apartment } from "@/lib/types";

const TOWERS = [1, 2, 3, 4, 5];

function floorLabel(floor: number) {
  if (floor === 0) return "Garden";
  if (floor === 7) return "Cobertura";
  return `${floor}º andar`;
}

export default function ForgotPassword() {
  const [tower, setTower] = useState<number | null>(null);
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [floor, setFloor] = useState<number | null>(null);
  const [apartmentId, setApartmentId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (tower === null) return;
    setFloor(null);
    setApartmentId(null);
    listApartmentsByTower(tower).then(({ apartments: rows }) => setApartments(rows));
  }, [tower]);

  const floors = useMemo(
    () => Array.from(new Set(apartments.map((a) => a.floor))).sort((a, b) => a - b),
    [apartments],
  );
  const unitsOnFloor = useMemo(
    () => apartments.filter((a) => a.floor === floor).sort((a, b) => a.unitNumber - b.unitNumber),
    [apartments, floor],
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (tower === null || !apartmentId) {
      setError("Selecione torre e apartamento.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await authService.requestPasswordReset({ email, tower, apartmentId });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar o e-mail.");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setDone(false);
    setEmail("");
    setTower(null);
    setFloor(null);
    setApartmentId(null);
    setApartments([]);
    setError(null);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-navy px-4 py-8">
      <div className="w-full max-w-lg space-y-6">
        <img src="/logo.png" alt="Fantasy 2 comunidade" className="mx-auto h-16 w-16 rounded-full object-cover" />
        <GradientBorderCard>
          <Card className="border-none shadow-none">
            {done ? (
              <>
                <CardHeader>
                  <CardTitle>Confira seu e-mail</CardTitle>
                  <CardDescription>
                    Se o e-mail estiver ligado a essa torre/apartamento em uma conta aprovada,
                    mandamos um link pra redefinir a senha. O link vale por 1 hora. Se você acabou
                    de pedir, aguarde até 10 minutos antes de tentar de novo.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button asChild className="w-full">
                    <Link to="/login">Voltar pro login</Link>
                  </Button>
                  <button
                    type="button"
                    className="w-full text-center text-xs text-muted-foreground underline"
                    onClick={resetForm}
                  >
                    Tentar com outros dados
                  </button>
                </CardContent>
              </>
            ) : (
              <>
                <CardHeader>
                  <CardTitle>Esqueci minha senha</CardTitle>
                  <CardDescription>
                    Informe a torre, o apartamento e o e-mail da conta. Só enviamos o link se esses
                    dados baterem.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label>Torre</Label>
                    <div className="flex flex-wrap gap-2">
                      {TOWERS.map((t) => (
                        <Button
                          key={t}
                          type="button"
                          variant={tower === t ? "default" : "outline"}
                          size="sm"
                          onClick={() => setTower(t)}
                        >
                          Torre {t}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {tower !== null && (
                    <div className="space-y-2">
                      <Label>Andar</Label>
                      <div className="flex flex-wrap gap-2">
                        {floors.map((f) => (
                          <Button
                            key={f}
                            type="button"
                            variant={floor === f ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                              setFloor(f);
                              setApartmentId(null);
                            }}
                          >
                            {floorLabel(f)}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {floor !== null && (
                    <div className="space-y-2">
                      <Label>Apartamento</Label>
                      <div className="grid grid-cols-4 gap-2">
                        {unitsOnFloor.map((apt) => (
                          <button
                            key={apt.id}
                            type="button"
                            onClick={() => setApartmentId(apt.id)}
                            className={cn(
                              "rounded-md border px-2 py-3 text-sm font-medium transition-colors hover:bg-accent",
                              apartmentId === apt.id &&
                                "border-primary bg-primary text-primary-foreground hover:bg-primary",
                            )}
                          >
                            {apt.code}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {apartmentId && (
                    <form onSubmit={handleSubmit} className="space-y-4 border-t pt-4">
                      <div className="space-y-2">
                        <Label htmlFor="email">E-mail da conta</Label>
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
                  )}

                  <p className="text-center text-sm text-muted-foreground">
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
