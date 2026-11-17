import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TopicSortControl } from "@/components/TopicSortControl";
import { QueryError } from "@/components/QueryError";
import { DEFAULT_TOPIC_SORT, parseTopicSort } from "@/lib/topicSort";
import * as topicsService from "@/services/topics";

export default function TopicsList() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const sort = parseTopicSort(searchParams.get("sort"));

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["topics", "open", sort],
    queryFn: () => topicsService.listTopics("open", sort),
  });

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

  function handleSortChange(next: typeof sort) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next === DEFAULT_TOPIC_SORT) params.delete("sort");
        else params.set("sort", next);
        return params;
      },
      { replace: true },
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Pautas para assembleia</h1>
          <p className="text-sm text-muted-foreground">Pautas em aberto aguardando assembleia.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/pautas/historico">
              <History className="mr-1.5 h-4 w-4" />
              Histórico
            </Link>
          </Button>
          <Button onClick={() => setShowForm((v) => !v)}>{showForm ? "Cancelar" : "Nova pauta"}</Button>
        </div>
      </div>

      <TopicSortControl value={sort} onChange={handleSortChange} />

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
                  <Badge variant="secondary">Em aberto</Badge>
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
          <p className="text-muted-foreground">Nenhuma pauta em aberto no momento.</p>
        )}
      </div>
    </div>
  );
}
