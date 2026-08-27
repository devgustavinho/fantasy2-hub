import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Instagram, MessageCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StarRating } from "@/components/StarRating";
import { useAuth } from "@/contexts/AuthContext";
import * as recommendationsService from "@/services/recommendations";
import { resolveMediaUrl } from "@/lib/api";
import { buildInstagramLink, buildWhatsAppLink } from "@/lib/utils";

const MAX_MEDIA_PER_COMMENT = 4;

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

  const [commentBody, setCommentBody] = useState("");
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [commentError, setCommentError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["recommendation", id],
    queryFn: () => recommendationsService.getRecommendation(id!),
    enabled: !!id,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["recommendation", id] });
    queryClient.invalidateQueries({ queryKey: ["recommendations"] });
  }

  const rateMutation = useMutation({
    mutationFn: (stars: number) => recommendationsService.rateRecommendation(id!, stars),
    onSuccess: invalidate,
  });

  const editMutation = useMutation({
    mutationFn: () =>
      recommendationsService.updateRecommendation(id!, {
        name: editName,
        description: editDescription || undefined,
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
      navigate("/recomendacoes");
    },
  });

  const commentMutation = useMutation({
    mutationFn: () => recommendationsService.addRecommendationComment(id!, commentBody, commentFiles),
    onSuccess: () => {
      setCommentBody("");
      setCommentFiles([]);
      setCommentError(null);
      invalidate();
    },
    onError: (err) => setCommentError(err instanceof Error ? err.message : "Erro ao comentar."),
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) => recommendationsService.deleteRecommendationComment(id!, commentId),
    onSuccess: invalidate,
  });

  if (isLoading || !data) {
    return <p className="mx-auto max-w-4xl px-4 py-8 text-muted-foreground">Carregando...</p>;
  }

  const { recommendation, comments, myRating } = data;
  const isOwner = user?.id === recommendation.createdBy.id;
  const isStaff = user?.role === "admin" || user?.role === "sindico";
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
    if (window.confirm("Tem certeza que deseja excluir esta recomendação? Essa ação não pode ser desfeita.")) {
      deleteMutation.mutate();
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const combined = [...commentFiles, ...Array.from(files)].slice(0, MAX_MEDIA_PER_COMMENT);
    setCommentFiles(combined);
  }

  function removeFile(index: number) {
    setCommentFiles((current) => current.filter((_, i) => i !== index));
  }

  function handleComment(e: FormEvent) {
    e.preventDefault();
    if (!commentBody.trim() && commentFiles.length === 0) {
      setCommentError("Escreva um comentário ou anexe uma foto/vídeo.");
      return;
    }
    commentMutation.mutate();
  }

  function handleDeleteComment(commentId: string) {
    if (window.confirm("Excluir este comentário?")) {
      deleteCommentMutation.mutate(commentId);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <Link
        to="/recomendacoes"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para recomendações
      </Link>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            {!isEditing && <CardTitle>{recommendation.name}</CardTitle>}
            <div className="ml-auto flex items-center gap-2">
              {isOwner && !isEditing && (
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
                <Label htmlFor="editName">Nome</Label>
                <Input id="editName" required value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editDescription">Descrição</Label>
                <Textarea
                  id="editDescription"
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
            <>
              {recommendation.description && (
                <p className="whitespace-pre-wrap text-sm">{recommendation.description}</p>
              )}
              <p className="text-xs text-muted-foreground">Recomendado por {recommendation.createdBy.name}</p>
            </>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {recommendation.whatsapp && (
              <Button variant="outline" size="sm" asChild>
                <a
                  href={buildWhatsAppLink(recommendation.whatsapp, `Olá! Vi sua recomendação no Fantasy 2 Hub.`)}
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

          <div className="flex items-center gap-3 border-t pt-4">
            <StarRating value={recommendation.avgRating ?? 0} />
            <span className="text-sm text-muted-foreground">
              {recommendation.avgRating ? recommendation.avgRating.toFixed(1) : "Sem avaliações"}
              {recommendation.ratingCount > 0 ? ` (${recommendation.ratingCount} avaliações)` : ""}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm">Sua avaliação:</span>
            <StarRating value={myRating ?? 0} onChange={(stars) => rateMutation.mutate(stars)} size="lg" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comentários ({comments.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleComment} className="space-y-2">
            <Textarea
              placeholder="Conte como foi o serviço..."
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              rows={2}
            />
            <div className="flex flex-wrap items-center gap-2">
              {commentFiles.map((file, index) => (
                <span
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs"
                >
                  {file.name}
                  <button type="button" onClick={() => removeFile(index)} className="text-muted-foreground hover:text-destructive">
                    ×
                  </button>
                </span>
              ))}
              {commentFiles.length < MAX_MEDIA_PER_COMMENT && (
                <label className="flex cursor-pointer items-center rounded-md border border-dashed px-3 py-1.5 text-xs text-muted-foreground hover:border-primary/50">
                  + foto/vídeo
                  <input
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      handleFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
            {commentError && <p className="text-sm text-destructive">{commentError}</p>}
            <Button type="submit" size="sm" disabled={commentMutation.isPending}>
              {commentMutation.isPending ? "Enviando..." : "Comentar"}
            </Button>
          </form>

          <div className="space-y-3">
            {comments.map((comment) => {
              const canDeleteComment = !!user && (user.id === comment.author.id || isStaff);
              return (
                <div key={comment.id} className="rounded-md border p-3 text-sm">
                  {comment.body && <p className="whitespace-pre-wrap">{comment.body}</p>}
                  {comment.media.length > 0 && (
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {comment.media.map((media) =>
                        media.mediaType === "video" ? (
                          <video
                            key={media.id}
                            src={resolveMediaUrl(media.path)}
                            controls
                            className="aspect-square w-full rounded-md bg-black object-cover"
                          />
                        ) : (
                          <img
                            key={media.id}
                            src={resolveMediaUrl(media.path)}
                            alt=""
                            className="aspect-square w-full rounded-md object-cover"
                          />
                        ),
                      )}
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      {comment.author.name} · {new Date(comment.createdAt).toLocaleString("pt-BR")}
                    </span>
                    {canDeleteComment && (
                      <button
                        type="button"
                        className="ml-auto inline-flex items-center gap-1 hover:text-destructive"
                        onClick={() => handleDeleteComment(comment.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Excluir
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {comments.length === 0 && <p className="text-sm text-muted-foreground">Nenhum comentário ainda.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
