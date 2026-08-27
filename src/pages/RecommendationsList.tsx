import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { QueryError } from "@/components/QueryError";
import { StarRating } from "@/components/StarRating";
import * as recommendationsService from "@/services/recommendations";
import * as tagsApi from "@/services/tags";
import { cn } from "@/lib/utils";

export default function RecommendationsList() {
  const queryClient = useQueryClient();
  const [filterTags, setFilterTags] = useState<string[]>([]);

  const { data: tagsData } = useQuery({ queryKey: ["tags"], queryFn: tagsApi.listTags });
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["recommendations", filterTags],
    queryFn: () => recommendationsService.listRecommendations(filterTags),
  });

  const tags = useMemo(() => tagsData?.tags ?? [], [tagsData]);

  function toggleFilterTag(id: string) {
    setFilterTags((current) => (current.includes(id) ? current.filter((t) => t !== id) : [...current, id]));
  }

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [instagram, setInstagram] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function toggleFormTag(id: string) {
    setSelectedTagIds((current) => (current.includes(id) ? current.filter((t) => t !== id) : [...current, id]));
  }

  const createMutation = useMutation({
    mutationFn: () =>
      recommendationsService.createRecommendation({
        name,
        description: description || undefined,
        whatsapp: whatsapp || undefined,
        instagram: instagram || undefined,
        tagIds: selectedTagIds,
      }),
    onSuccess: () => {
      setName("");
      setDescription("");
      setWhatsapp("");
      setInstagram("");
      setSelectedTagIds([]);
      setShowForm(false);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["recommendations"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Erro ao cadastrar recomendação."),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    createMutation.mutate();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Recomendações de serviço</h1>
          <p className="text-sm text-muted-foreground">
            Prestadores indicados por moradores — avalie e comente com fotos/vídeos.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? "Cancelar" : "Recomendar"}</Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Recomendar um prestador de serviço</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome</Label>
                <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  rows={3}
                  placeholder="Que tipo de serviço, como foi a experiência..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="whatsapp">WhatsApp</Label>
                  <Input
                    id="whatsapp"
                    placeholder="(11) 91234-5678"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="instagram">Instagram</Label>
                  <Input
                    id="instagram"
                    placeholder="@perfil"
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Informe pelo menos um WhatsApp ou Instagram.</p>
              {tags.length > 0 && (
                <div className="space-y-2">
                  <Label>Tags</Label>
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleFormTag(tag.id)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs transition-colors",
                          selectedTagIds.includes(tag.id)
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input bg-background text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {tag.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Enviando..." : "Cadastrar recomendação"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggleFilterTag(tag.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                filterTags.includes(tag.id)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {tag.name}
            </button>
          ))}
        </div>
      )}

      {isLoading && <p className="text-muted-foreground">Carregando...</p>}
      {isError && <QueryError onRetry={() => refetch()} />}

      <div className="grid gap-4 sm:grid-cols-2">
        {data?.recommendations.map((rec) => (
          <Link key={rec.id} to={`/recomendacoes/${rec.id}`}>
            <Card className="h-full transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
              <CardHeader>
                <CardTitle className="text-base">{rec.name}</CardTitle>
                <p className="text-xs text-muted-foreground">por {rec.createdBy.name}</p>
              </CardHeader>
              <CardContent className="space-y-2">
                {rec.description && <p className="text-sm text-muted-foreground">{rec.description}</p>}
                <div className="flex items-center gap-3 text-sm">
                  <StarRating value={rec.avgRating ?? 0} size="sm" />
                  <span className="text-xs text-muted-foreground">
                    {rec.avgRating ? rec.avgRating.toFixed(1) : "Sem avaliações"}
                    {rec.ratingCount > 0 ? ` (${rec.ratingCount})` : ""}
                  </span>
                  {rec.commentCount > 0 && (
                    <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <MessageCircle className="h-3.5 w-3.5" />
                      {rec.commentCount}
                    </span>
                  )}
                </div>
                {rec.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {rec.tags.map((tag) => (
                      <span
                        key={tag.id}
                        className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
        {data && data.recommendations.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma recomendação cadastrada ainda.</p>
        )}
      </div>
    </div>
  );
}
