import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GradientBorderCard } from "@/components/ui/gradient-border-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import * as authService from "@/services/auth";
import { listApartmentsByTower } from "@/services/apartments";
import type { Apartment } from "@/lib/types";

const TOWERS = [1, 2, 3, 4, 5];

function floorLabel(floor: number) {
  if (floor === 0) return "Garden";
  if (floor === 7) return "Cobertura";
  return `${floor}º andar`;
}

export default function Register() {
  const [tower, setTower] = useState<number | null>(null);
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [floor, setFloor] = useState<number | null>(null);
  const [apartmentId, setApartmentId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { setUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (tower === null) return;
    setFloor(null);
    setApartmentId(null);
    listApartmentsByTower(tower).then(({ apartments }) => setApartments(apartments));
  }, [tower]);

  const floors = useMemo(() => Array.from(new Set(apartments.map((a) => a.floor))).sort((a, b) => a - b), [apartments]);
  const unitsOnFloor = useMemo(
    () => apartments.filter((a) => a.floor === floor).sort((a, b) => a.unitNumber - b.unitNumber),
    [apartments, floor],
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!apartmentId) {
      setError("Selecione o apartamento.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { user } = await authService.register({ apartmentId, name, email, password });
      setUser(user);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao cadastrar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-navy px-4 py-8">
      <div className="w-full max-w-lg space-y-6">
      <img src="/logo.png" alt="Fantasy 2" className="mx-auto h-16 w-16" />
      <GradientBorderCard>
      <Card className="border-none shadow-none">
        <CardHeader>
          <CardTitle>Cadastro do condômino</CardTitle>
          <CardDescription>
            Selecione a torre, o andar e o apartamento. Depois de cadastrado, o apartamento fica
            reservado para essa conta.
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
                    disabled={!apt.available}
                    onClick={() => setApartmentId(apt.id)}
                    className={cn(
                      "rounded-md border px-2 py-3 text-sm font-medium transition-colors",
                      !apt.available && "cursor-not-allowed bg-muted text-muted-foreground opacity-60",
                      apt.available && apartmentId !== apt.id && "hover:bg-accent",
                      apartmentId === apt.id && "border-primary bg-primary text-primary-foreground",
                    )}
                  >
                    {apt.code}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Apartamentos em cinza já foram cadastrados por outro condômino.
              </p>
            </div>
          )}

          {apartmentId && (
            <form onSubmit={handleSubmit} className="space-y-4 border-t pt-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome</Label>
                <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
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
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Cadastrando..." : "Cadastrar"}
              </Button>
            </form>
          )}

          <p className="text-center text-sm text-muted-foreground">
            Já tem conta?{" "}
            <Link to="/login" className="font-medium text-primary underline">
              Entrar
            </Link>
          </p>
        </CardContent>
      </Card>
      </GradientBorderCard>
      </div>
    </div>
  );
}
