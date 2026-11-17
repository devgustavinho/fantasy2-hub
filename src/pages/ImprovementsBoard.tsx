import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { QueryError } from "@/components/QueryError";
import { useAuth } from "@/contexts/AuthContext";
import * as improvementsService from "@/services/improvements";
import type { Improvement, ImprovementStatus } from "@/lib/types";

const STATUS_META: Record<ImprovementStatus, { label: string; badge: "secondary" | "default" | "success" }> = {
  new: { label: "Nova", badge: "secondary" },
  reviewing: { label: "Em análise", badge: "default" },
  in_progress: { label: "Em andamento", badge: "default" },
  done: { label: "Concluída", badge: "success" },
};

const COLUMN_ORDER: ImprovementStatus[] = ["new", "reviewing", "in_progress", "done"];

export default function ImprovementsBoard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isStaff = user?.role === "admin" || user?.role === "sindico";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["improvements"],
    queryFn: improvementsService.listImprovements,
  });

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () => improvementsService.createImprovement({ title, description }),
    onSuccess: () => {
      setTitle("");
      setDescription("");
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["improvements"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Erro ao criar."),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ImprovementStatus }) =>
      improvementsService.updateImprovementStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["improvements"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => improvementsService.deleteImprovement(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["improvements"] }),
  });

  const byStatus = useMemo(() => {
    const map: Record<ImprovementStatus, Improvement[]> = {
      new: [],
      reviewing: [],
      in_progress: [],
      done: [],
    };
    for (const item of data?.improvements ?? []) {
      map[item.status]?.push(item);
    }
    return map;
  }, [data]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    createMutation.mutate();
  }

  function canDelete(item: Improvement) {
    if (!user) return false;
    if (isStaff) return true;
    return item.createdById === user.id && item.status === "new";
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Melhorias do Portal</h1>
          <p className="text-sm text-muted-foreground">
            Sugira melhorias e acompanhe o andamento. A administração move os cards entre os status.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? "Cancelar" : "Nova sugestão"}</Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Nova sugestão</CardTitle>
            <CardDescription>Descreva o que você gostaria de ver no Fantasy 2 Hub.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="imp-title">Título</Label>
                <Input id="imp-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="imp-desc">Descrição</Label>
                <Textarea
                  id="imp-desc"
                  required
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Enviando..." : "Enviar sugestão"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading && <p className="text-muted-foreground">Carregando...</p>}
      {isError && <QueryError onRetry={() => refetch()} />}

      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 snap-x snap-mandatory">
        {COLUMN_ORDER.map((status) => (
          <section
            key={status}
            className="w-[85vw] max-w-xs shrink-0 snap-start rounded-xl border bg-muted/30 p-3 sm:w-72"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">{STATUS_META[status].label}</h2>
              <Badge variant="secondary">{byStatus[status].length}</Badge>
            </div>
            <div className="space-y-2">
              {byStatus[status].map((item) => (
                <Card key={item.id} className="shadow-sm">
                  <CardHeader className="space-y-1 p-3 pb-1">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm leading-snug">{item.title}</CardTitle>
                      {canDelete(item) && (
                        <button
                          type="button"
                          aria-label="Excluir"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            if (confirm("Excluir esta sugestão?")) deleteMutation.mutate(item.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <CardDescription className="text-xs">por {item.createdByName}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 p-3 pt-1">
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">{item.description}</p>
                    {isStaff ? (
                      <label className="block space-y-1 text-xs text-muted-foreground">
                        Status
                        <select
                          className="w-full rounded-md border bg-background px-2 py-1.5 text-sm text-foreground"
                          value={item.status}
                          disabled={statusMutation.isPending}
                          onChange={(e) =>
                            statusMutation.mutate({
                              id: item.id,
                              status: e.target.value as ImprovementStatus,
                            })
                          }
                        >
                          {COLUMN_ORDER.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_META[s].label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <Badge variant={STATUS_META[item.status].badge}>{STATUS_META[item.status].label}</Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
              {byStatus[status].length === 0 && (
                <p className="px-1 py-6 text-center text-xs text-muted-foreground">Nenhuma neste status.</p>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
