import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DoorOpen, Globe, HandMetal, Instagram, Package, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { QueryError } from "@/components/QueryError";
import * as servicesApi from "@/services/services";
import * as tagsApi from "@/services/tags";
import { resolveMediaUrl } from "@/lib/api";
import {
  FULFILLMENT_MODES,
  FULFILLMENT_SHORT,
  type FulfillmentMode,
} from "@/lib/fulfillment";
import { buildInstagramLink, cn } from "@/lib/utils";
import type { BusinessSegment } from "@/services/services";

const MODE_ICONS: Record<FulfillmentMode, typeof DoorOpen> = {
  door: DoorOpen,
  pickup: Package,
  lobby: HandMetal,
  online: Globe,
};

const SEGMENTS: { id: BusinessSegment; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "food", label: "Comida" },
  { id: "services", label: "Serviços" },
];

export default function Services() {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedModes, setSelectedModes] = useState<FulfillmentMode[]>([]);
  const [segment, setSegment] = useState<BusinessSegment>("all");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  const { data: tagsData } = useQuery({ queryKey: ["tags"], queryFn: tagsApi.listTags });
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["services", selectedTags, selectedModes, segment, q],
    queryFn: () =>
      servicesApi.listServices({
        tagIds: selectedTags,
        modes: selectedModes,
        segment,
        q,
      }),
  });

  const tags = useMemo(() => tagsData?.tags ?? [], [tagsData]);

  function toggleTag(id: string) {
    setSelectedTags((current) => (current.includes(id) ? current.filter((t) => t !== id) : [...current, id]));
  }

  function toggleMode(mode: FulfillmentMode) {
    setSelectedModes((current) =>
      current.includes(mode) ? current.filter((m) => m !== mode) : [...current, mode],
    );
  }

  const emptyCopy =
    segment === "food"
      ? "Ninguém oferece comida ainda — seja o primeiro em Meu negócio."
      : segment === "services"
        ? "Nenhum serviço encontrado com esses filtros."
        : "Nenhum negócio encontrado.";

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Negócios</h1>
          <p className="text-sm text-muted-foreground">
            Comida e serviços de moradores. Monte o pedido e finalize no WhatsApp.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/negocios/meu">Meu negócio</Link>
        </Button>
      </div>

      <div className="sticky top-0 z-10 -mx-4 space-y-3 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(search.trim());
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar negócio..."
            className="pl-9"
          />
        </form>

        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {SEGMENTS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSegment(s.id)}
              className={cn(
                "shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                segment === s.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {FULFILLMENT_MODES.map((mode) => {
            const Icon = MODE_ICONS[mode];
            const active = selectedModes.includes(mode);
            return (
              <button
                key={mode}
                type="button"
                onClick={() => toggleMode(mode)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-input text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3 w-3" />
                {FULFILLMENT_SHORT[mode]}
              </button>
            );
          })}
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-[11px] transition-colors",
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
      </div>

      {isLoading && <p className="text-muted-foreground">Carregando...</p>}
      {isError && <QueryError onRetry={() => refetch()} />}

      <div className="grid gap-4 sm:grid-cols-2">
        {data?.services.map((service) => (
          <Link key={service.id} to={`/negocios/${service.id}`}>
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
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{service.name}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {service.owner.name}
                  {service.owner.tower && service.owner.apartmentCode
                    ? ` · Torre ${service.owner.tower} - ${service.owner.apartmentCode}`
                    : ""}
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {service.fulfillmentModes.map((mode) => {
                    const Icon = MODE_ICONS[mode];
                    return (
                      <span
                        key={mode}
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
                        title={FULFILLMENT_SHORT[mode]}
                      >
                        <Icon className="h-3 w-3" />
                        {FULFILLMENT_SHORT[mode]}
                      </span>
                    );
                  })}
                </div>
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
                    {service.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag.id}
                        className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
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
          <p className="col-span-full text-sm text-muted-foreground">{emptyCopy}</p>
        )}
      </div>
    </div>
  );
}
