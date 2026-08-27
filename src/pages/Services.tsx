import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Instagram } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryError } from "@/components/QueryError";
import * as servicesApi from "@/services/services";
import * as tagsApi from "@/services/tags";
import { resolveMediaUrl } from "@/lib/api";
import { buildInstagramLink, cn } from "@/lib/utils";

export default function Services() {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const { data: tagsData } = useQuery({ queryKey: ["tags"], queryFn: tagsApi.listTags });
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["services", selectedTags],
    queryFn: () => servicesApi.listServices(selectedTags),
  });

  const tags = useMemo(() => tagsData?.tags ?? [], [tagsData]);

  function toggleTag(id: string) {
    setSelectedTags((current) => (current.includes(id) ? current.filter((t) => t !== id) : [...current, id]));
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Serviços do condomínio</h1>
          <p className="text-sm text-muted-foreground">
            Serviços oferecidos por outros moradores. Clique em um serviço pra ver os itens.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/servicos/meu">Meu serviço</Link>
        </Button>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggleTag(tag.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                selectedTags.includes(tag.id)
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
        {data?.services.map((service) => (
          <Link key={service.id} to={`/servicos/${service.id}`}>
            <Card className="h-full transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
              {service.imagePath && (
                <div className="aspect-video w-full overflow-hidden rounded-t-lg bg-muted/40">
                  <img
                    src={resolveMediaUrl(service.imagePath)}
                    alt={service.name}
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
              <CardHeader>
                <CardTitle className="text-base">{service.name}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {service.owner.name}
                  {service.owner.tower && service.owner.apartmentCode
                    ? ` · Torre ${service.owner.tower} - ${service.owner.apartmentCode}`
                    : ""}
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {service.description && <p className="text-sm text-muted-foreground">{service.description}</p>}
                {service.instagram && (
                  <span
                    onClick={(e) => {
                      e.preventDefault();
                      window.open(buildInstagramLink(service.instagram!), "_blank", "noreferrer");
                    }}
                    className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                  >
                    <Instagram className="h-3.5 w-3.5" />@{service.instagram}
                  </span>
                )}
                {service.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {service.tags.map((tag) => (
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
        {data && data.services.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum serviço encontrado.</p>
        )}
      </div>
    </div>
  );
}
