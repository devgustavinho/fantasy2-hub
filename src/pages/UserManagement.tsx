import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { QueryError } from "@/components/QueryError";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import * as usersService from "@/services/users";
import * as servicesApi from "@/services/services";
import { listApartmentsByTower } from "@/services/apartments";
import type { Apartment, ManagedUser, Role } from "@/lib/types";

const PAGE_SIZE = 20;
const TOWERS = [1, 2, 3, 4, 5];

const ROLE_LABEL: Record<Role, string> = {
  admin: "admin",
  sindico: "síndico",
  conselheiro: "conselheiro",
  morador: "morador",
};

const ALL_ROLES: Role[] = ["admin", "sindico", "conselheiro", "morador"];

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
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {user.name} vai poder editar tudo depois em "Meu serviço".
      </p>
      <Input placeholder="Nome do serviço" value={name} onChange={(e) => setName(e.target.value)} />
      <Input placeholder="WhatsApp (opcional)" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
      <Input placeholder="Instagram (opcional)" value={instagram} onChange={(e) => setInstagram(e.target.value)} />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? "Criando..." : "Criar serviço"}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function floorLabel(floor: number) {
  if (floor === 0) return "Garden";
  if (floor === 7) return "Cobertura";
  return `${floor}º andar`;
}

function roleBadge(role: Role) {
  if (role === "admin") return <Badge>Admin</Badge>;
  if (role === "sindico") return <Badge variant="success">Síndico</Badge>;
  if (role === "conselheiro") return <Badge variant="gold">Conselheiro</Badge>;
  return <Badge variant="secondary">Morador</Badge>;
}

function isResidentLike(role: Role) {
  return role === "morador" || role === "conselheiro";
}

function approvalBadge(status: ManagedUser["approvalStatus"]) {
  if (status === "pending") return <Badge variant="secondary">Pendente</Badge>;
  if (status === "rejected") return <Badge variant="destructive">Recusado</Badge>;
  return null;
}

type RoleAction = { id: string; name: string; from: Role; to: Role };

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const focusUserId = searchParams.get("user");

  const [page, setPage] = useState(1);
  const [towerFilter, setTowerFilter] = useState<number | null>(null);
  const [apartmentFilter, setApartmentFilter] = useState("");
  const [apartmentDraft, setApartmentDraft] = useState("");

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["users", page, towerFilter, apartmentFilter],
    queryFn: () =>
      usersService.listUsers({
        page,
        pageSize: PAGE_SIZE,
        tower: towerFilter,
        apartment: apartmentFilter || undefined,
      }),
  });

  const { data: pendingData } = useQuery({
    queryKey: ["users-pending"],
    queryFn: () => usersService.listUsers({ page: 1, pageSize: 50, approvalStatus: "pending" }),
    enabled: isAdmin,
  });

  const [resetSentFor, setResetSentFor] = useState<ManagedUser | null>(null);
  const [emailChangedFor, setEmailChangedFor] = useState<{ name: string; email: string } | null>(null);
  const [approvalConflict, setApprovalConflict] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ManagedUser | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [actionsUser, setActionsUser] = useState<ManagedUser | null>(null);
  const [roleConfirm, setRoleConfirm] = useState<RoleAction | null>(null);
  const [serviceUser, setServiceUser] = useState<ManagedUser | null>(null);
  const [emailUser, setEmailUser] = useState<ManagedUser | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);

  const { data: focusUserData } = useQuery({
    queryKey: ["user", focusUserId],
    queryFn: () => usersService.getUser(focusUserId!),
    enabled: !!focusUserId,
    retry: false,
  });

  useEffect(() => {
    if (focusUserData?.user) {
      setActionsUser(focusUserData.user);
    }
  }, [focusUserData]);

  function clearFocusUser() {
    setActionsUser(null);
    if (!focusUserId) return;
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete("user");
        return params;
      },
      { replace: true },
    );
  }

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
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Erro ao criar síndico."),
  });

  const [roleError, setRoleError] = useState<string | null>(null);
  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => usersService.changeUserRole(id, role),
    onSuccess: () => {
      setRoleError(null);
      setRoleConfirm(null);
      setActionsUser(null);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => setRoleError(err instanceof Error ? err.message : "Erro ao mudar o cargo."),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (target: ManagedUser) => usersService.resetUserPassword(target.id),
    onSuccess: (_result, target) => {
      setResetSentFor(target);
      setActionsUser(null);
    },
  });

  const changeEmailMutation = useMutation({
    mutationFn: ({ id, email }: { id: string; email: string }) => usersService.changeUserEmail(id, email),
    onSuccess: (result, vars) => {
      const target = emailUser ?? data?.users.find((u) => u.id === vars.id);
      setEmailChangedFor({ name: target?.name ?? "Morador", email: result.user.email });
      setEmailUser(null);
      setEmailDraft("");
      setEmailError(null);
      setActionsUser(null);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => setEmailError(err instanceof Error ? err.message : "Erro ao alterar e-mail."),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => usersService.approveUser(id),
    onSuccess: () => {
      setApprovalConflict(null);
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["users-pending"] });
    },
    onError: (err) => {
      setApprovalConflict(err instanceof Error ? err.message : "Não foi possível aprovar o cadastro.");
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["users-pending"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      usersService.rejectUser(id, reason ? { reason } : {}),
    onSuccess: () => {
      setApprovalConflict(null);
      setRejectTarget(null);
      setRejectReason("");
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["users-pending"] });
    },
    onError: (err) => {
      setApprovalConflict(err instanceof Error ? err.message : "Não foi possível recusar o cadastro.");
      setRejectTarget(null);
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["users-pending"] });
    },
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (linkApartment && !apartmentId) {
      setError("Selecione um apartamento ou desmarque a opção de vincular.");
      return;
    }
    createMutation.mutate();
  }

  function applyApartmentFilter(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setApartmentFilter(apartmentDraft.trim());
  }

  function requestRoleChange(user: ManagedUser, to: Role) {
    setActionsUser(null);
    setRoleConfirm({ id: user.id, name: user.name, from: user.role, to });
  }

  function openEmailEdit(user: ManagedUser) {
    setActionsUser(null);
    setEmailUser(user);
    setEmailDraft(user.email);
    setEmailError(null);
  }

  function submitEmailEdit() {
    if (!emailUser) return;
    const next = emailDraft.trim().toLowerCase();
    if (!next || !next.includes("@")) {
      setEmailError("Informe um e-mail válido.");
      return;
    }
    changeEmailMutation.mutate({ id: emailUser.id, email: next });
  }

  function roleOptionsFor(user: ManagedUser): Role[] {
    if (!isAdmin || user.id === currentUser?.id) return [];
    return ALL_ROLES.filter((r) => r !== user.role);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Usuários</h1>
        {isAdmin && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Criar síndico
          </Button>
        )}
      </div>

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

      {emailChangedFor && (
        <Card className="border-brand-gold/50 bg-brand-gold/10">
          <CardContent className="space-y-2 pt-6">
            <p className="text-sm">
              E-mail de <strong>{emailChangedFor.name}</strong> atualizado para{" "}
              <strong>{emailChangedFor.email}</strong>. Aviso enviado para o endereço antigo e o novo.
            </p>
            <Button size="sm" variant="outline" onClick={() => setEmailChangedFor(null)}>
              Fechar
            </Button>
          </CardContent>
        </Card>
      )}

      {approvalConflict && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="space-y-2 pt-6">
            <p className="text-sm">{approvalConflict}</p>
            <Button size="sm" variant="outline" onClick={() => setApprovalConflict(null)}>
              Fechar
            </Button>
          </CardContent>
        </Card>
      )}

      {isAdmin && pendingData && pendingData.users.length > 0 && (
        <Card className="border-brand-cyan/50 bg-brand-cyan/10">
          <CardHeader>
            <CardTitle className="text-base">Cadastros pendentes de aprovação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingData.users.map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-3 rounded-md border bg-card p-3 text-sm">
                <div>
                  <p className="font-medium">{u.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {u.email} · {u.tower ? `Torre ${u.tower} - ${u.apartmentCode}` : "Sem apartamento"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" disabled={approveMutation.isPending} onClick={() => approveMutation.mutate(u.id)}>
                    Aprovar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={rejectMutation.isPending}
                    onClick={() => {
                      setRejectTarget(u);
                      setRejectReason("");
                    }}
                  >
                    Recusar
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle className="text-base">Moradores e equipe</CardTitle>
              <CardDescription>
                Tabela paginada — filtre por torre e apartamento.
                {data ? ` ${data.total} no total.` : ""}
              </CardDescription>
            </div>
            {data && (
              <span className="text-xs text-muted-foreground">
                Página {data.page} de {totalPages}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label>Torre</Label>
              <div className="flex flex-wrap gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={towerFilter === null ? "default" : "outline"}
                  onClick={() => {
                    setTowerFilter(null);
                    setPage(1);
                  }}
                >
                  Todas
                </Button>
                {TOWERS.map((t) => (
                  <Button
                    key={t}
                    type="button"
                    size="sm"
                    variant={towerFilter === t ? "default" : "outline"}
                    onClick={() => {
                      setTowerFilter(t);
                      setPage(1);
                    }}
                  >
                    {t}
                  </Button>
                ))}
              </div>
            </div>
            <form onSubmit={applyApartmentFilter} className="flex items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="apartmentFilter">Apartamento</Label>
                <Input
                  id="apartmentFilter"
                  placeholder="Ex.: 101"
                  value={apartmentDraft}
                  onChange={(e) => setApartmentDraft(e.target.value)}
                  className="h-9 w-32"
                />
              </div>
              <Button type="submit" size="sm" variant="outline">
                Buscar
              </Button>
              {(apartmentFilter || towerFilter !== null) && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setApartmentDraft("");
                    setApartmentFilter("");
                    setTowerFilter(null);
                    setPage(1);
                  }}
                >
                  Limpar
                </Button>
              )}
            </form>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <p className="text-muted-foreground">Carregando...</p>}
          {isError && <QueryError onRetry={() => refetch()} />}
          {roleError && <p className="text-sm text-destructive">{roleError}</p>}

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Nome</th>
                  <th className="px-3 py-2 font-medium">E-mail</th>
                  <th className="px-3 py-2 font-medium">Torre</th>
                  <th className="px-3 py-2 font-medium">Apto</th>
                  <th className="px-3 py-2 font-medium">Papel</th>
                  <th className="px-3 py-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {data?.users.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  const hasActions =
                    !isSelf && (isAdmin || isResidentLike(u.role));
                  return (
                    <tr key={u.id} className="border-b last:border-0">
                      <td className="px-3 py-3">
                        <div className="font-medium">{u.name}</div>
                        {u.householdRole === "family" && (
                          <Badge variant="secondary" className="mt-1">
                            Familiar
                          </Badge>
                        )}
                        {approvalBadge(u.approvalStatus)}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{u.email}</td>
                      <td className="px-3 py-3 tabular-nums">{u.tower ?? "—"}</td>
                      <td className="px-3 py-3">{u.apartmentCode ?? "—"}</td>
                      <td className="px-3 py-3">{roleBadge(u.role)}</td>
                      <td className="px-3 py-3">
                        {hasActions ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            aria-label={`Ações de ${u.name}`}
                            onClick={() => setActionsUser(u)}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only sm:not-sr-only sm:inline">Ações</span>
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {data && data.users.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">Nenhum usuário encontrado com esses filtros.</p>
            )}
          </div>

          {data && data.total > data.pageSize && (
            <div className="flex items-center justify-between pt-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <span className="text-xs text-muted-foreground">
                Página {page} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Próxima
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create síndico — padrão CRUD: botão abre sheet */}
      <BottomSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Criar conta de síndico"
        description="Só o administrador pode criar contas de síndico."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
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
                  <div className="grid grid-cols-4 gap-2">
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
          <Button type="submit" className="w-full" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Criando..." : "Criar síndico"}
          </Button>
        </form>
      </BottomSheet>

      {/* Menu de ações da linha */}
      <BottomSheet
        open={!!actionsUser}
        onClose={clearFocusUser}
        title={actionsUser ? `Ações · ${actionsUser.name}` : "Ações"}
        description={
          actionsUser
            ? `${actionsUser.email}${actionsUser.tower ? ` · Torre ${actionsUser.tower} - ${actionsUser.apartmentCode}` : ""}`
            : undefined
        }
      >
        {actionsUser && (
          <div className="space-y-1">
            {roleOptionsFor(actionsUser).map((to) => (
              <button
                key={to}
                type="button"
                className="flex w-full rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-muted"
                onClick={() => requestRoleChange(actionsUser, to)}
              >
                Alterar para {ROLE_LABEL[to]}
              </button>
            ))}
            {isAdmin && actionsUser.role !== "admin" && (
              <button
                type="button"
                className="flex w-full rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-muted"
                onClick={() => openEmailEdit(actionsUser)}
              >
                Alterar e-mail
              </button>
            )}
            {actionsUser.role !== "admin" && (isAdmin || isResidentLike(actionsUser.role)) && (
              <button
                type="button"
                className="flex w-full rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-muted"
                disabled={resetPasswordMutation.isPending}
                onClick={() => resetPasswordMutation.mutate(actionsUser)}
              >
                Resetar senha
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                className="flex w-full rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-muted"
                onClick={() => {
                  setServiceUser(actionsUser);
                  setActionsUser(null);
                }}
              >
                Criar serviço
              </button>
            )}
          </div>
        )}
      </BottomSheet>

      {/* Confirmação de promoção/rebaixamento */}
      <BottomSheet
        open={!!roleConfirm}
        onClose={() => setRoleConfirm(null)}
        title="Confirmar alteração de cargo"
      >
        {roleConfirm && (
          <div className="space-y-4">
            <p className="text-sm">
              Alterar <strong>{roleConfirm.name}</strong> de{" "}
              <strong>{ROLE_LABEL[roleConfirm.from]}</strong> para{" "}
              <strong>{ROLE_LABEL[roleConfirm.to]}</strong>?
            </p>
            {roleConfirm.to === "admin" && (
              <p className="text-sm text-muted-foreground">
                Admins precisam de 2FA e têm acesso total ao condomínio.
              </p>
            )}
            {roleConfirm.to === "conselheiro" && (
              <p className="text-sm text-muted-foreground">
                Conselheiro é só uma tag de reconhecimento — sem poderes de síndico ou admin.
              </p>
            )}
            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={roleMutation.isPending}
                onClick={() => roleMutation.mutate({ id: roleConfirm.id, role: roleConfirm.to })}
              >
                {roleMutation.isPending ? "Salvando..." : "Confirmar"}
              </Button>
              <Button className="flex-1" variant="outline" onClick={() => setRoleConfirm(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </BottomSheet>

      <BottomSheet
        open={!!rejectTarget}
        onClose={() => {
          setRejectTarget(null);
          setRejectReason("");
        }}
        title="Recusar cadastro"
        description={rejectTarget ? `${rejectTarget.name} · ${rejectTarget.email}` : undefined}
      >
        {rejectTarget && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              A pessoa recebe um e-mail avisando a recusa. O motivo é opcional — se preencher,
              entra no e-mail. Depois ela pode se cadastrar de novo com o mesmo e-mail.
            </p>
            <div className="space-y-2">
              <Label htmlFor="rejectReason">Motivo (opcional)</Label>
              <Textarea
                id="rejectReason"
                rows={3}
                maxLength={500}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Ex.: apartamento já tem outro responsável cadastrado"
              />
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                variant="destructive"
                disabled={rejectMutation.isPending}
                onClick={() =>
                  rejectMutation.mutate({
                    id: rejectTarget.id,
                    reason: rejectReason.trim() || undefined,
                  })
                }
              >
                {rejectMutation.isPending ? "Recusando..." : "Confirmar recusa"}
              </Button>
              <Button
                className="flex-1"
                variant="outline"
                onClick={() => {
                  setRejectTarget(null);
                  setRejectReason("");
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </BottomSheet>

      <BottomSheet
        open={!!emailUser}
        onClose={() => setEmailUser(null)}
        title="Alterar e-mail"
        description={emailUser?.name}
      >
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="newEmail">Novo e-mail</Label>
            <Input
              id="newEmail"
              type="email"
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
            />
          </div>
          {emailError && <p className="text-sm text-destructive">{emailError}</p>}
          <Button className="w-full" disabled={changeEmailMutation.isPending} onClick={submitEmailEdit}>
            {changeEmailMutation.isPending ? "Salvando..." : "Salvar e-mail"}
          </Button>
        </div>
      </BottomSheet>

      <BottomSheet
        open={!!serviceUser}
        onClose={() => setServiceUser(null)}
        title="Criar serviço"
        description={serviceUser?.name}
      >
        {serviceUser && (
          <CreateServiceForUserForm user={serviceUser} onDone={() => setServiceUser(null)} />
        )}
      </BottomSheet>
    </div>
  );
}
