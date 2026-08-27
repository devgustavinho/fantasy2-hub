import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import * as servicesApi from "@/services/services";
import * as tagsApi from "@/services/tags";
import { cn } from "@/lib/utils";

export default function ServiceTagsAdmin() {
  const queryClient = useQueryClient();
  const [newTag, setNewTag] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: tagsData } = useQuery({ queryKey: ["tags"], queryFn: tagsApi.listTags });
  const { data: servicesData } = useQuery({ queryKey: ["services"], queryFn: () => servicesApi.listServices() });

  const createTagMutation = useMutation({
    mutationFn: (name: string) => tagsApi.createTag(name),
    onSuccess: () => {
      setNewTag("");
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["tags"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Erro ao criar tag."),
  });

  const deleteTagMutation = useMutation({
    mutationFn: (id: string) => tagsApi.deleteTag(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      queryClient.invalidateQueries({ queryKey: ["services"] });
    },
  });

  const assignMutation = useMutation({
    mutationFn: ({ serviceId, tagIds }: { serviceId: string; tagIds: string[] }) =>
      servicesApi.assignServiceTags(serviceId, tagIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["services"] }),
  });

  const tags = tagsData?.tags ?? [];
  const services = servicesData?.services ?? [];

  function handleCreateTag(e: FormEvent) {
    e.preventDefault();
    if (!newTag.trim()) return;
    createTagMutation.mutate(newTag.trim());
  }

  function toggleServiceTag(serviceId: string, currentTagIds: string[], tagId: string) {
    const next = currentTagIds.includes(tagId)
      ? currentTagIds.filter((id) => id !== tagId)
      : [...currentTagIds, tagId];
    assignMutation.mutate({ serviceId, tagIds: next });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Tags de serviços</h1>
        <p className="text-sm text-muted-foreground">
          Cadastre as tags disponíveis e atribua a cada serviço — os moradores usam elas pra filtrar em
          "Serviços".
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tags cadastradas</CardTitle>
          <CardDescription>Excluir uma tag remove ela de todos os serviços que a usam.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form onSubmit={handleCreateTag} className="flex gap-2">
            <Input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="Nova tag (ex: Comida, Reforma, Aulas)"
            />
            <Button type="submit" size="sm" disabled={createTagMutation.isPending}>
              Adicionar
            </Button>
          </form>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag.id}
                className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground"
              >
                {tag.name}
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Excluir a tag "${tag.name}"?`)) deleteTagMutation.mutate(tag.id);
                  }}
                  className="hover:text-destructive"
                  aria-label={`Excluir ${tag.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {tags.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma tag cadastrada ainda.</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Atribuir tags aos serviços</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {services.map((service) => {
            const currentTagIds = service.tags.map((t) => t.id);
            return (
              <div key={service.id} className="space-y-1.5 rounded-md border p-3">
                <p className="text-sm font-medium">
                  {service.name} <span className="font-normal text-muted-foreground">· {service.owner.name}</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => {
                    const active = currentTagIds.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleServiceTag(service.id, currentTagIds, tag.id)}
                        className={cn(
                          "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {tag.name}
                      </button>
                    );
                  })}
                  {tags.length === 0 && (
                    <p className="text-xs text-muted-foreground">Cadastre uma tag acima primeiro.</p>
                  )}
                </div>
              </div>
            );
          })}
          {services.length === 0 && <p className="text-sm text-muted-foreground">Nenhum serviço cadastrado ainda.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
