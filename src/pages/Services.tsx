import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import * as servicesApi from "@/services/services";
import { API_URL } from "@/lib/api";
import { buildWhatsAppLink, formatCentsToBRL } from "@/lib/utils";

export default function Services() {
  const { data, isLoading } = useQuery({ queryKey: ["services"], queryFn: servicesApi.listServices });

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Serviços do condomínio</h1>
          <p className="text-sm text-muted-foreground">
            Serviços e produtos oferecidos por outros moradores. Clique em um item para chamar no
            WhatsApp.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/servicos/meu">Meu serviço</Link>
        </Button>
      </div>

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
            </CardHeader>
            <CardContent>
              {service.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum item cadastrado ainda.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {service.items.map((item) => {
                    const link = service.owner.whatsapp
                      ? buildWhatsAppLink(
                          service.owner.whatsapp,
                          `Olá! Tenho interesse em "${item.name}" (${service.name}).`,
                        )
                      : null;
                    return (
                      <a
                        key={item.id}
                        href={link ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="group flex flex-col overflow-hidden rounded-md border transition-colors hover:border-primary/50"
                      >
                        <div className="flex aspect-square items-center justify-center bg-muted/40">
                          {item.imagePath ? (
                            <img
                              src={`${API_URL}${item.imagePath}`}
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
                      </a>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {data && data.services.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum serviço cadastrado ainda.</p>
        )}
      </div>
    </div>
  );
}
