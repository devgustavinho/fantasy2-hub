import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Instagram, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import * as recommendationsService from "@/services/recommendations";
import { buildInstagramLink, buildWhatsAppLink } from "@/lib/utils";

export default function RecommendationDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editWhatsapp, setEditWhatsapp] = useState("");
  const [editInstagram, setEditInstagram] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["recommendation", id],
    queryFn: () => recommendationsService.getRecommendation(id!),
    enabled: !!id,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["recommendation", id] });
    queryClient.invalidateQueries({ queryKey: ["recommendations"] });
  }

  const editMutation = useMutation({
    mutationFn: () =>
      recommendationsService.updateRecommendation(id!, {
        name: editName,
        description: editDescription,
        whatsapp: editWhatsapp || undefined,
        instagram: editInstagram || undefined,
      }),
    onSuccess: () => {
      setIsEditing(false);
      setEditError(null);
      invalidate();
    },
    onError: (err) => setEditError(err instanceof Error ? err.message : "Erro ao salvar."),
  });

  const deleteMutation = useMutation({
    mutationFn: () => recommendationsService.deleteRecommendation(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recommendations"] });
      navigate("/contatos-condominio");
    },
  });

  if (isLoading) {
    return <p className="mx-auto max-w-4xl px-4 py-8 text-muted-foreground">Carregando...</p>;
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-8">
        <Link
          to="/contatos-condominio"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar para contatos
        </Link>
        <p className="text-sm text-muted-foreground">Contato não encontrado.</p>
      </div>
    );
  }

  const { recommendation } = data;
  const isOwner = user?.id === recommendation.createdBy.id;
  const isStaff = user?.role === "admin" || user?.role === "sindico";
  const canEdit = isOwner || isStaff;
  const canDelete = isOwner || isStaff;

  function startEditing() {
    setEditName(recommendation.name);
    setEditDescription(recommendation.description ?? "");
    setEditWhatsapp(recommendation.whatsapp ?? "");
    setEditInstagram(recommendation.instagram ?? "");
    setEditError(null);
    setIsEditing(true);
  }

  function handleEditSubmit(e: FormEvent) {
    e.preventDefault();
    setEditError(null);
    editMutation.mutate();
  }

  function handleDelete() {
    if (window.confirm("Tem certeza que deseja excluir este contato? Essa ação não pode ser desfeita.")) {
      deleteMutation.mutate();
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <Link
        to="/contatos-condominio"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para contatos
      </Link>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            {!isEditing && <CardTitle>{recommendation.name}</CardTitle>}
            <div className="ml-auto flex items-center gap-2">
              {canEdit && !isEditing && (
                <Button variant="outline" size="sm" onClick={startEditing}>
                  Editar
                </Button>
              )}
              {canDelete && (
                <Button variant="destructive" size="sm" disabled={deleteMutation.isPending} onClick={handleDelete}>
                  Excluir
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isEditing ? (
            <form onSubmit={handleEditSubmit} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="editName">Nome do negócio</Label>
                <Input id="editName" required minLength={2} value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editDescription">Tipo de serviço</Label>
                <Textarea
                  id="editDescription"
                  required
                  minLength={2}
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="editWhatsapp">WhatsApp</Label>
                  <Input
                    id="editWhatsapp"
                    value={editWhatsapp}
                    onChange={(e) => setEditWhatsapp(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editInstagram">Instagram</Label>
                  <Input
                    id="editInstagram"
                    value={editInstagram}
                    onChange={(e) => setEditInstagram(e.target.value)}
                  />
                </div>
              </div>
              {editError && <p className="text-sm text-destructive">{editError}</p>}
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={editMutation.isPending}>
                  {editMutation.isPending ? "Salvando..." : "Salvar"}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          ) : (
            recommendation.description && (
              <p className="whitespace-pre-wrap text-sm">{recommendation.description}</p>
            )
          )}

          <div className="flex flex-wrap items-center gap-3">
            {recommendation.whatsapp && (
              <Button variant="outline" size="sm" asChild>
                <a
                  href={buildWhatsAppLink(recommendation.whatsapp, `Olá! Vi seu contato no Fantasy 2 Hub.`)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
                  WhatsApp
                </a>
              </Button>
            )}
            {recommendation.instagram && (
              <Button variant="outline" size="sm" asChild>
                <a href={buildInstagramLink(recommendation.instagram)} target="_blank" rel="noreferrer">
                  <Instagram className="mr-1.5 h-3.5 w-3.5" />@{recommendation.instagram}
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
