import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateOnly } from "@/lib/utils";
import * as topicsService from "@/services/topics";
import { QueryError } from "@/components/QueryError";

function StatusBadge({ status, assemblyDate }: { status: string; assemblyDate: string | null }) {
  if (status === "scheduled") {
    return (
      <Badge variant="success">
        Pautada {assemblyDate ? `em ${formatDateOnly(assemblyDate)}` : ""}
      </Badge>
    );
  }
  return <Badge variant="secondary">Em aberto</Badge>;
}

export default function TopicsList() {
  const queryClient = useQueryClient();
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({ queryKey: ["topics"], queryFn: topicsService.listTopics });

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () => topicsService.createTopic({ title, description }),
    onSuccess: () => {
      setTitle("");
      setDescription("");
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["topics"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Erro ao criar pauta."),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    createMutation.mutate();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Pautas para assembleia</h1>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? "Cancelar" : "Nova pauta"}</Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Nova pauta</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Título</Label>
                <Input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  required
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Enviando..." : "Criar pauta"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading && <p className="text-muted-foreground">Carregando...</p>}
      {isError && <QueryError onRetry={() => refetch()} />}

      <div className="space-y-3">
        {data?.topics.map((topic) => (
          <Link key={topic.id} to={`/topics/${topic.id}`}>
            <Card className="transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{topic.title}</CardTitle>
                  <StatusBadge status={topic.status} assemblyDate={topic.assemblyDate} />
                </div>
              </CardHeader>
              <CardContent className="flex items-center gap-4 pt-0 text-sm text-muted-foreground">
                <span>👍 {topic.favorCount}</span>
                <span>👎 {topic.contraCount}</span>
                <span>💬 {topic.commentCount ?? 0}</span>
                <span className="ml-auto">por {topic.createdByName}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
        {data && data.topics.length === 0 && (
          <p className="text-muted-foreground">Nenhuma pauta cadastrada ainda.</p>
        )}
      </div>
    </div>
  );
}
