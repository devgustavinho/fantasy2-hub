import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryError } from "@/components/QueryError";
import * as apartmentsService from "@/services/apartments";
import { cn } from "@/lib/utils";
import type { HouseholdRole } from "@/lib/types";

const TOWERS = [1, 2, 3, 4, 5];

function floorLabel(floor: number) {
  if (floor === 0) return "Garden";
  if (floor === 7) return "Cobertura";
  return `${floor}º andar`;
}

function householdBadge(role: HouseholdRole) {
  return role === "owner" ? "Titular" : "Familiar";
}

export default function ApartmentMap() {
  const [tower, setTower] = useState(1);
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["apartment-map", tower],
    queryFn: () => apartmentsService.getApartmentMap(tower),
  });

  const floors = Array.from(new Set(data?.apartments.map((a) => a.floor) ?? [])).sort((a, b) => b - a);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Mapa de apartamentos</h1>
        <p className="text-sm text-muted-foreground">
          Quem mora em cada unidade, por torre — titular e familiar (quando houver).
        </p>
      </div>

      <div className="flex gap-2">
        {TOWERS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTower(t)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm transition-colors",
              tower === t
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input text-muted-foreground hover:text-foreground",
            )}
          >
            Torre {t}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-muted-foreground">Carregando...</p>}
      {isError && <QueryError onRetry={() => refetch()} />}

      <div className="space-y-3">
        {floors.map((floor) => (
          <Card key={floor}>
            <CardHeader className="py-3">
              <CardTitle className="text-sm text-muted-foreground">{floorLabel(floor)}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {data?.apartments
                .filter((a) => a.floor === floor)
                .map((apt) => (
                  <div
                    key={apt.id}
                    className={cn(
                      "rounded-md border p-2 text-xs",
                      apt.residents.length === 0 && "bg-muted/30 text-muted-foreground",
                    )}
                  >
                    <p className="font-medium">{apt.code}</p>
                    {apt.residents.length === 0 ? (
                      <p>Vago</p>
                    ) : (
                      <div className="mt-1 space-y-0.5">
                        {apt.residents.map((r) => (
                          <p key={r.id} className="truncate">
                            {r.name}{" "}
                            <span className="text-muted-foreground">
                              ({householdBadge(r.householdRole)}
                              {r.approvalStatus !== "approved" ? ` · ${r.approvalStatus}` : ""})
                            </span>
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
