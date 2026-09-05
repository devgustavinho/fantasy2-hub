import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryError } from "@/components/QueryError";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import * as usersService from "@/services/users";
import * as servicesApi from "@/services/services";
import { listApartmentsByTower } from "@/services/apartments";
import type { Apartment, ManagedUser, Role } from "@/lib/types";

// Deixa o admin cadastrar um serviço em nome de um morador (ex. alguém sem prática/tempo de
// mexer no app sozinho) — depois de criado, o próprio morador edita tudo em "Meu serviço".
function CreateServiceForUserForm({ user, onDone }: { user: ManagedUser; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [instagram, setInstagram] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      servicesApi.createService({
        name,
        whatsapp: whatsapp || undefined,
        instagram: instagram || undefined,
        userId: user.id,
      }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["services"] });
      onDone();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Erro ao cadastrar serviço."),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Preencha o nome do serviço.");
      return;
    }
    createMutation.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 space-y-2 rounded-md border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">
        {user.name} vai poder editar tudo depois em "Meu serviço" (itens, fotos, opções...).
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <Input
          placeholder="Nome do serviço"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-8 text-sm"
        />
        <Input
          placeholder="WhatsApp (opcional)"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          className="h-8 text-sm"
        />
        <Input
          placeholder="Instagram (opcional)"
          value={instagram}
          onChange={(e) => setInstagram(e.target.value)}
          className="h-8 text-sm"
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={createMutation.isPending}>
          {createMutation.isPending ? "Criando..." : "Criar serviço"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

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

function approvalBadge(status: ManagedUser["approvalStatus"]) {
  if (status === "pending") return <Badge variant="secondary">Pendente</Badge>;
  if (status === "rejected") return <Badge variant="destructive">Recusado</Badge>;
  return null;
}

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";
  const queryClient = useQueryClient();
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({ queryKey: ["users"], queryFn: usersService.listUsers });
  const [resetSentFor, setResetSentFor] = useState<ManagedUser | null>(null);
  const [serviceFormUserId, setServiceFormUserId] = useState<string | null>(null);

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

  const [roleError, setRoleError] = useState<string | null>(null);
  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => usersService.changeUserRole(id, role),
    onSuccess: () => {
      setRoleError(null);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => setRoleError(err instanceof Error ? err.message : "Erro ao mudar o cargo."),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (target: ManagedUser) => usersService.resetUserPassword(target.id),
    onSuccess: (_result, target) => setResetSentFor(target),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => usersService.approveUser(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => usersService.rejectUser(id),
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

      {resetSentFor && (
        <Card className="border-brand-gold/50 bg-brand-gold/10">
          <CardContent className="space-y-2 pt-6">
            <p className="text-sm">
              E-mail de redefinição enviado para <strong>{resetSentFor.name}</strong> ({resetSentFor.email}).
              O link vale por 1 hora e a pessoa escolhe a própria senha nova.
            </p>
            <Button size="sm" variant="outline" onClick={() => setResetSentFor(null)}>
              Fechar
            </Button>
          </CardContent>
        </Card>
      )}

      {isAdmin && data && data.users.some((u) => u.approvalStatus === "pending") && (
        <Card className="border-brand-cyan/50 bg-brand-cyan/10">
          <CardHeader>
            <CardTitle className="text-base">Cadastros pendentes de aprovação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.users
              .filter((u) => u.approvalStatus === "pending")
              .map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-3 rounded-md border bg-card p-3 text-sm">
                  <div>
                    <p className="font-medium">{u.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {u.email} · {u.tower ? `Torre ${u.tower} - ${u.apartmentCode}` : "Sem apartamento"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      disabled={approveMutation.isPending}
                      onClick={() => approveMutation.mutate(u.id)}
                    >
                      Aprovar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={rejectMutation.isPending}
                      onClick={() => rejectMutation.mutate(u.id)}
                    >
                      Recusar
                    </Button>
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      {isAdmin && (
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
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Todos os usuários</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <p className="text-muted-foreground">Carregando...</p>}
          {isError && <QueryError onRetry={() => refetch()} />}
          {roleError && <p className="text-sm text-destructive">{roleError}</p>}
          {data?.users.map((u) => {
            const isSelf = u.id === currentUser?.id;
            return (
              <div key={u.id} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {u.name} <span className="font-normal text-muted-foreground">· {u.email}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {u.tower ? `Torre ${u.tower} - ${u.apartmentCode}` : "Sem apartamento"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {roleBadge(u.role)}
                  {u.householdRole === "family" && <Badge variant="secondary">Familiar</Badge>}
                  {approvalBadge(u.approvalStatus)}
                  {!isSelf && isAdmin && u.role === "admin" && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={roleMutation.isPending}
                        onClick={() => roleMutation.mutate({ id: u.id, role: "sindico" })}
                      >
                        Rebaixar p/ síndico
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={roleMutation.isPending}
                        onClick={() => roleMutation.mutate({ id: u.id, role: "morador" })}
                      >
                        Rebaixar p/ morador
                      </Button>
                    </>
                  )}
                  {!isSelf && isAdmin && u.role === "sindico" && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={roleMutation.isPending}
                        onClick={() => roleMutation.mutate({ id: u.id, role: "morador" })}
                      >
                        Rebaixar para morador
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={roleMutation.isPending}
                        onClick={() => roleMutation.mutate({ id: u.id, role: "admin" })}
                      >
                        Promover a admin
                      </Button>
                    </>
                  )}
                  {!isSelf && isAdmin && u.role === "morador" && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={roleMutation.isPending}
                        onClick={() => roleMutation.mutate({ id: u.id, role: "sindico" })}
                      >
                        Promover a síndico
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={roleMutation.isPending}
                        onClick={() => roleMutation.mutate({ id: u.id, role: "admin" })}
                      >
                        Promover a admin
                      </Button>
                    </>
                  )}
                  {!isSelf && u.role !== "admin" && (isAdmin || u.role === "morador") && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={resetPasswordMutation.isPending}
                      onClick={() => resetPasswordMutation.mutate(u)}
                    >
                      Resetar senha
                    </Button>
                  )}
                  {!isSelf && isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setServiceFormUserId(serviceFormUserId === u.id ? null : u.id)}
                    >
                      Criar serviço
                    </Button>
                  )}
                </div>
              </div>
              {serviceFormUserId === u.id && (
                <CreateServiceForUserForm user={u} onDone={() => setServiceFormUserId(null)} />
              )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
