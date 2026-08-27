import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import * as servicesApi from "@/services/services";
import * as tagsApi from "@/services/tags";
import { API_URL } from "@/lib/api";
import { buildWhatsAppLink, cn, formatCentsToBRL } from "@/lib/utils";
import type { CondoService, ServiceItem } from "@/lib/types";

function ItemDetail({
  service,
  item,
  onClose,
}: {
  service: CondoService;
  item: ServiceItem;
  onClose: () => void;
}) {
  const [activeImage, setActiveImage] = useState(0);
  const link = service.owner.whatsapp
    ? buildWhatsAppLink(service.owner.whatsapp, `Olá! Tenho interesse em "${item.name}" (${service.name}).`)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative aspect-square bg-muted/40">
          {item.images.length > 0 ? (
            <img
              src={`${API_URL}${item.images[activeImage].path}`}
              alt={item.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Sem foto
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-2 top-2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
          {item.images.length > 1 && (
            <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
              {item.images.map((img, idx) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setActiveImage(idx)}
                  className={cn(
                    "h-2 w-2 rounded-full",
                    idx === activeImage ? "bg-white" : "bg-white/40",
                  )}
                  aria-label={`Foto ${idx + 1}`}
                />
              ))}
            </div>
          )}
        </div>
        <div className="space-y-3 p-4">
          <div>
            <h2 className="text-lg font-semibold">{item.name}</h2>
            <p className="text-sm font-medium text-primary">{formatCentsToBRL(item.priceCents)}</p>
          </div>
          {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
          <Button asChild className="w-full" disabled={!link}>
            <a href={link ?? undefined} target="_blank" rel="noreferrer">
              Falar com {service.name}
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Services() {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [detail, setDetail] = useState<{ service: CondoService; item: ServiceItem } | null>(null);

  const { data: tagsData } = useQuery({ queryKey: ["tags"], queryFn: tagsApi.listTags });
  const { data, isLoading } = useQuery({
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
            Serviços e produtos oferecidos por outros moradores. Clique em um item para ver detalhes.
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

      <div className="space-y-6">
        {data?.services.map((service) => (
          <Card key={service.id}>
            <CardHeader>
              <CardTitle className="text-base">{service.name}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {service.owner.name}
                {service.owner.tower && service.owner.apartmentCode
                  ? ` · Torre ${service.owner.tower} - ${service.owner.apartmentCode}`
                  : ""}
              </p>
              {service.description && <p className="text-sm text-muted-foreground">{service.description}</p>}
              {service.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
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
            </CardHeader>
            <CardContent>
              {service.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum item cadastrado ainda.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {service.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setDetail({ service, item })}
                      className="group flex flex-col overflow-hidden rounded-md border text-left transition-colors hover:border-primary/50"
                    >
                      <div className="flex aspect-square items-center justify-center bg-muted/40">
                        {item.images.length > 0 ? (
                          <img
                            src={`${API_URL}${item.images[0].path}`}
                            alt={item.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">Sem foto</span>
                        )}
                      </div>
                      <div className="space-y-0.5 p-2">
                        <p className="truncate text-sm font-medium group-hover:text-primary">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{formatCentsToBRL(item.priceCents)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {data && data.services.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum serviço encontrado.</p>
        )}
      </div>

      {detail && <ItemDetail service={detail.service} item={detail.item} onClose={() => setDetail(null)} />}
    </div>
  );
}
