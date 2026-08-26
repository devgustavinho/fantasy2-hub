import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import * as usersService from "@/services/users";
import { listApartmentsByTower } from "@/services/apartments";
import type { Apartment, Role } from "@/lib/types";

const TOWERS = [1, 2, 3, 4, 5];

function floorLabel(floor: number) {
  if (floor === 0) return "Garden";
  if (floor === 7) return "Cobertura";
  return `${floor}º andar`;
}

function roleBadge(role: Role) {
  if (role === "admin") return <Badge>Admin</Badge>;
  if (role === "sindico") return <Badge variant="success">Síndico</Badge>;
  return <Badge variant="secondary">Morador</Badge>;
}

export default function UserManagement() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["users"], queryFn: usersService.listUsers });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [linkApartment, setLinkApartment] = useState(false);
  const [tower, setTower] = useState<number | null>(null);
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [floor, setFloor] = useState<number | null>(null);
  const [apartmentId, setApartmentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tower === null) return;
    setFloor(null);
    setApartmentId(null);
    listApartmentsByTower(tower).then(({ apartments }) => setApartments(apartments));
  }, [tower]);

  const floors = useMemo(
    () => Array.from(new Set(apartments.map((a) => a.floor))).sort((a, b) => a - b),
    [apartments],
  );
  const unitsOnFloor = useMemo(
    () => apartments.filter((a) => a.floor === floor).sort((a, b) => a.unitNumber - b.unitNumber),
    [apartments, floor],
  );

  const createMutation = useMutation({
    mutationFn: () =>
      usersService.createSindico({
        name,
        email,
        password,
        apartmentId: linkApartment ? apartmentId : null,
      }),
    onSuccess: () => {
      setName("");
      setEmail("");
      setPassword("");
      setLinkApartment(false);
      setTower(null);
      setApartmentId(null);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Erro ao criar síndico."),
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: "sindico" | "morador" }) =>
      usersService.changeUserRole(id, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (linkApartment && !apartmentId) {
      setError("Selecione um apartamento ou desmarque a opção de vincular.");
      return;
    }
    createMutation.mutate();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">Usuários</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Criar conta de síndico</CardTitle>
          <CardDescription>Só o administrador pode criar contas de síndico e trocar cargos.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
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
              <div className="space-y-2 sm:col-span-2">
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
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={linkApartment}
                onChange={(e) => setLinkApartment(e.target.checked)}
              />
              Este síndico também mora no condomínio (vincular a um apartamento)
            </label>

            {linkApartment && (
              <div className="space-y-4 rounded-md border p-3">
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
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                      {unitsOnFloor.map((apt) => (
                        <button
                          key={apt.id}
                          type="button"
                          disabled={!apt.available}
                          onClick={() => setApartmentId(apt.id)}
                          className={cn(
                            "rounded-md border px-2 py-2 text-sm font-medium transition-colors",
                            !apt.available && "cursor-not-allowed bg-muted text-muted-foreground opacity-60",
                            apt.available && apartmentId !== apt.id && "hover:bg-accent",
                            apartmentId === apt.id && "border-primary bg-primary text-primary-foreground",
                          )}
                        >
                          {apt.code}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Criando..." : "Criar síndico"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Todos os usuários</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <p className="text-muted-foreground">Carregando...</p>}
          {data?.users.map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
              <div>
                <p className="font-medium">
                  {u.name} <span className="font-normal text-muted-foreground">· {u.email}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {u.tower ? `Torre ${u.tower} - ${u.apartmentCode}` : "Sem apartamento"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {roleBadge(u.role)}
                {u.role === "sindico" && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={roleMutation.isPending}
                    onClick={() => roleMutation.mutate({ id: u.id, role: "morador" })}
                  >
                    Rebaixar para morador
                  </Button>
                )}
                {u.role === "morador" && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={roleMutation.isPending}
                    onClick={() => roleMutation.mutate({ id: u.id, role: "sindico" })}
                  >
                    Promover a síndico
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
