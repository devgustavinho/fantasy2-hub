import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Instagram, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { QueryError } from "@/components/QueryError";
import * as recommendationsService from "@/services/recommendations";
import { buildInstagramLink, buildWhatsAppLink } from "@/lib/utils";

export default function RecommendationsList() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [instagram, setInstagram] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["recommendations"],
    queryFn: () => recommendationsService.listRecommendations(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      recommendationsService.createRecommendation({
        name,
        description,
        whatsapp: whatsapp || undefined,
        instagram: instagram || undefined,
      }),
    onSuccess: () => {
      setName("");
      setDescription("");
      setWhatsapp("");
      setInstagram("");
      setShowForm(false);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["recommendations"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Erro ao cadastrar contato."),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    createMutation.mutate();
  }

  function closeForm() {
    if (!createMutation.isPending) setShowForm(false);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Contatos do condomínio</h1>
          <p className="text-sm text-muted-foreground">
            Prestadores e comércios úteis — nome, tipo de serviço e WhatsApp ou Instagram.
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>Cadastrar</Button>
      </div>

      <BottomSheet
        open={showForm}
        onClose={closeForm}
        title="Cadastrar contato"
        description="Informe o negócio, o tipo de serviço e pelo menos um WhatsApp ou Instagram."
      >
        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto px-4 pb-6">
          <div className="space-y-2">
            <Label htmlFor="name">Nome do negócio</Label>
            <Input id="name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Tipo de serviço</Label>
            <Textarea
              id="description"
              required
              minLength={2}
              rows={3}
              placeholder="Ex.: vende garrafão de água, encanador, chaveiro…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="whatsapp">WhatsApp</Label>
              <Input
                id="whatsapp"
                placeholder="(85) 91234-5678"
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
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Cadastrando..." : "Cadastrar"}
          </Button>
        </form>
      </BottomSheet>

      {isLoading && <p className="text-muted-foreground">Carregando...</p>}
      {isError && <QueryError onRetry={() => refetch()} />}

      <div className="grid gap-4 sm:grid-cols-2">
        {data?.recommendations.map((rec) => (
          <Card key={rec.id} className="h-full transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                <Link to={`/contatos-condominio/${rec.id}`} className="hover:underline">
                  {rec.name}
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {rec.description && <p className="text-sm text-muted-foreground">{rec.description}</p>}
              <div className="flex flex-wrap items-center gap-2">
                {rec.whatsapp && (
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={buildWhatsAppLink(rec.whatsapp, `Olá! Vi seu contato no Fantasy 2 Hub.`)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
                      WhatsApp
                    </a>
                  </Button>
                )}
                {rec.instagram && (
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={buildInstagramLink(rec.instagram)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Instagram className="mr-1.5 h-3.5 w-3.5" />@{rec.instagram}
                    </a>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {data && data.recommendations.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum contato cadastrado ainda.</p>
        )}
      </div>
    </div>
  );
}
