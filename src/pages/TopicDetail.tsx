import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Share2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import * as topicsService from "@/services/topics";
import type { TopicCloseKind, VoteValue } from "@/lib/types";
import { buildWhatsAppShareLink, cn, formatDateOnly } from "@/lib/utils";

export default function TopicDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isDeletingWithReason, setIsDeletingWithReason] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [assemblyDate, setAssemblyDate] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState("");
  const [isClosing, setIsClosing] = useState(false);
  const [closeKind, setCloseKind] = useState<TopicCloseKind>("debated");
  const [closeReason, setCloseReason] = useState("");
  const [closeError, setCloseError] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["topic", id],
    queryFn: () => topicsService.getTopic(id!),
    enabled: !!id,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["topic", id] });
    queryClient.invalidateQueries({ queryKey: ["topics"] });
  }

  const voteMutation = useMutation({
    mutationFn: (value: VoteValue) => topicsService.voteOnTopic(id!, value),
    onSuccess: invalidate,
  });

  const commentMutation = useMutation({
    mutationFn: () => topicsService.commentOnTopic(id!, commentBody),
    onSuccess: () => {
      setCommentBody("");
      invalidate();
    },
  });

  const editCommentMutation = useMutation({
    mutationFn: () => topicsService.editComment(id!, editingCommentId!, editingCommentBody),
    onSuccess: () => {
      setEditingCommentId(null);
      invalidate();
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: (date: string | null) => topicsService.scheduleTopic(id!, date),
    onSuccess: invalidate,
  });

  const closeMutation = useMutation({
    mutationFn: () =>
      topicsService.closeTopic(id!, { kind: closeKind, reason: closeReason.trim() }),
    onSuccess: () => {
      setIsClosing(false);
      setCloseReason("");
      setCloseError(null);
      invalidate();
    },
    onError: (err) =>
      setCloseError(err instanceof Error ? err.message : "Erro ao fechar a pauta."),
  });

  const editMutation = useMutation({
    mutationFn: () => topicsService.editTopic(id!, { title: editTitle, description: editDescription }),
    onSuccess: () => {
      setIsEditing(false);
      setEditError(null);
      invalidate();
    },
    onError: (err) => setEditError(err instanceof Error ? err.message : "Erro ao salvar."),
  });

  const statusNoteMutation = useMutation({
    mutationFn: (note: string | null) => topicsService.updateStatusNote(id!, note),
    onSuccess: () => {
      setIsEditingNote(false);
      invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (reason?: string) => topicsService.deleteTopic(id!, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["topics"] });
      navigate("/");
    },
  });

  if (isLoading || !data) {
    return <p className="mx-auto max-w-4xl px-4 py-8 text-muted-foreground">Carregando...</p>;
  }

  const { topic, comments, events } = data;
  const isClosed = topic.status === "closed";
  const isStaff = user?.role === "admin" || user?.role === "sindico";
  const isOwner = user?.id === topic.createdById;
  const canEdit =
    !isClosed && !!user && (isOwner || user.role === "admin" || user.role === "sindico");
  const canDelete = !!user && (isOwner || user.role === "admin");
  const shareLink = buildWhatsAppShareLink(
    `📋 Vote nesta pauta do condomínio: "${topic.title}"\n${window.location.origin}/topics/${topic.id}`,
  );

  function statusBadge() {
    if (topic.status === "closed") {
      const kind =
        topic.closeKind === "debated"
          ? "Debatida"
          : topic.closeKind === "not_scheduled"
            ? "Não pautada"
            : "Fechada";
      return <Badge variant="secondary">Fechada · {kind}</Badge>;
    }
    if (topic.status === "scheduled") {
      return (
        <Badge variant="success">
          Pautada em {topic.assemblyDate ? formatDateOnly(topic.assemblyDate) : "-"}
        </Badge>
      );
    }
    return <Badge variant="secondary">Em aberto</Badge>;
  }

  function handleCloseSubmit(e: FormEvent) {
    e.preventDefault();
    setCloseError(null);
    if (closeReason.trim().length < 4) {
      setCloseError("Escreva o motivo (mínimo 4 caracteres).");
      return;
    }
    closeMutation.mutate();
  }

  function handleDeleteOwn() {
    if (window.confirm("Tem certeza que deseja excluir esta pauta? Essa ação não pode ser desfeita.")) {
      deleteMutation.mutate(undefined);
    }
  }

  function handleDeleteWithReason(e: FormEvent) {
    e.preventDefault();
    if (deleteReason.trim().length < 10) return;
    deleteMutation.mutate(deleteReason.trim());
  }

  function handleComment(e: FormEvent) {
    e.preventDefault();
    if (!commentBody.trim()) return;
    commentMutation.mutate();
  }

  function startEditingComment(comment: { id: string; body: string }) {
    setEditingCommentId(comment.id);
    setEditingCommentBody(comment.body);
  }

  function handleEditComment(e: FormEvent) {
    e.preventDefault();
    if (!editingCommentBody.trim()) return;
    editCommentMutation.mutate();
  }

  function startEditing() {
    setEditTitle(topic.title);
    setEditDescription(topic.description);
    setEditError(null);
    setIsEditing(true);
  }

  function handleEditSubmit(e: FormEvent) {
    e.preventDefault();
    setEditError(null);
    editMutation.mutate();
  }

  function startEditingNote() {
    setNoteText(topic.statusNote ?? "");
    setIsEditingNote(true);
  }

  function handleNoteSubmit(e: FormEvent) {
    e.preventDefault();
    statusNoteMutation.mutate(noteText.trim() || null);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar para pautas
      </Link>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            {!isEditing && <CardTitle>{topic.title}</CardTitle>}
            <div className="ml-auto flex items-center gap-2">
              {statusBadge()}
              <Button variant="outline" size="sm" asChild>
                <a href={shareLink} target="_blank" rel="noreferrer">
                  <Share2 className="mr-1.5 h-3.5 w-3.5" />
                  Compartilhar
                </a>
              </Button>
              {canEdit && !isEditing && (
                <Button variant="outline" size="sm" onClick={startEditing}>
                  Editar
                </Button>
              )}
              {isOwner && canDelete && (
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deleteMutation.isPending}
                  onClick={handleDeleteOwn}
                >
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
                <Label htmlFor="editTitle">Título</Label>
                <Input
                  id="editTitle"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editDescription">Descrição</Label>
                <Textarea
                  id="editDescription"
                  required
                  rows={5}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                />
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
              <p className="whitespace-pre-wrap text-sm">{topic.description}</p>
              <p className="text-xs text-muted-foreground">Criada por {topic.createdByName}</p>
            </>
          )}

          {isClosed && topic.closeReason && (
            <div className="rounded-md border bg-muted/50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Motivo do fechamento
                {topic.closeKind === "debated"
                  ? " · debatida"
                  : topic.closeKind === "not_scheduled"
                    ? " · não pautada"
                    : ""}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{topic.closeReason}</p>
              {topic.closedAt && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Fechada em {new Date(topic.closedAt).toLocaleString("pt-BR")}
                </p>
              )}
            </div>
          )}

          {topic.statusNote && !isEditingNote && (
            <div className="rounded-md border border-brand-gold/40 bg-brand-gold/10 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-gold">
                Atualização da administração
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{topic.statusNote}</p>
            </div>
          )}

          {isClosed ? (
            <p className="text-sm text-muted-foreground">
              👍 {topic.favorCount} · 👎 {topic.contraCount} — votação encerrada (pauta fechada).
            </p>
          ) : user?.householdRole === "family" ? (
            <p className="text-sm text-muted-foreground">
              👍 {topic.favorCount} · 👎 {topic.contraCount} — membros da família não votam (é um voto por
              apartamento), mas podem comentar normalmente.
            </p>
          ) : (
            <div className="flex items-center gap-3">
              <Button
                variant={topic.myVote === "favor" ? "default" : "outline"}
                onClick={() => voteMutation.mutate("favor")}
                disabled={voteMutation.isPending}
              >
                👍 A favor ({topic.favorCount})
              </Button>
              <Button
                variant={topic.myVote === "contra" ? "destructive" : "outline"}
                onClick={() => voteMutation.mutate("contra")}
                disabled={voteMutation.isPending}
              >
                👎 Contra ({topic.contraCount})
              </Button>
            </div>
          )}

          {isStaff && (
            <div className="space-y-3 rounded-md border bg-muted/40 p-4">
              <p className="text-sm font-medium">Administração</p>
              {!isClosed &&
                (topic.status === "scheduled" ? (
                  <Button variant="outline" size="sm" onClick={() => scheduleMutation.mutate(null)}>
                    Reabrir pauta
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      value={assemblyDate}
                      onChange={(e) => setAssemblyDate(e.target.value)}
                      className="w-auto"
                    />
                    <Button
                      size="sm"
                      disabled={!assemblyDate || scheduleMutation.isPending}
                      onClick={() => scheduleMutation.mutate(assemblyDate)}
                    >
                      Marcar como pautada
                    </Button>
                  </div>
                ))}

              {!isClosed &&
                (isClosing ? (
                  <form onSubmit={handleCloseSubmit} className="space-y-3 border-t pt-3">
                    <p className="text-sm font-medium">Fechar pauta</p>
                    <div className="flex flex-wrap gap-4 text-sm">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="closeKind"
                          checked={closeKind === "debated"}
                          onChange={() => setCloseKind("debated")}
                        />
                        Debatida
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="closeKind"
                          checked={closeKind === "not_scheduled"}
                          onChange={() => setCloseKind("not_scheduled")}
                        />
                        Não pautada
                      </label>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="closeReason">Motivo</Label>
                      <Textarea
                        id="closeReason"
                        rows={3}
                        placeholder="Por que esta pauta foi fechada?"
                        value={closeReason}
                        onChange={(e) => setCloseReason(e.target.value)}
                      />
                    </div>
                    {closeError && <p className="text-sm text-destructive">{closeError}</p>}
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" disabled={closeMutation.isPending}>
                        {closeMutation.isPending ? "Fechando..." : "Confirmar fechamento"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setIsClosing(false);
                          setCloseError(null);
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="border-t pt-3">
                    <Button variant="outline" size="sm" onClick={() => setIsClosing(true)}>
                      Fechar pauta
                    </Button>
                  </div>
                ))}

              {!isClosed &&
                (isEditingNote ? (
                  <form onSubmit={handleNoteSubmit} className="space-y-2 border-t pt-3">
                    <Label htmlFor="statusNote">Atualização da administração</Label>
                    <Textarea
                      id="statusNote"
                      rows={3}
                      placeholder='Ex: "Será levada para a assembleia de novembro"'
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" disabled={statusNoteMutation.isPending}>
                        Salvar atualização
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setIsEditingNote(false)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="border-t pt-3">
                    <Button variant="outline" size="sm" onClick={startEditingNote}>
                      {topic.statusNote ? "Editar atualização" : "Adicionar atualização"}
                    </Button>
                  </div>
                ))}

              {!isOwner && user?.role === "admin" && (
                <div className="border-t pt-3">
                  {isDeletingWithReason ? (
                    <form onSubmit={handleDeleteWithReason} className="space-y-2">
                      <Label htmlFor="deleteReason">Motivo da exclusão (mínimo 10 caracteres)</Label>
                      <Textarea
                        id="deleteReason"
                        rows={2}
                        value={deleteReason}
                        onChange={(e) => setDeleteReason(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button
                          type="submit"
                          variant="destructive"
                          size="sm"
                          disabled={deleteReason.trim().length < 10 || deleteMutation.isPending}
                        >
                          Confirmar exclusão
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setIsDeletingWithReason(false)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <Button variant="destructive" size="sm" onClick={() => setIsDeletingWithReason(true)}>
                      Excluir pauta
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 border-l-2 border-muted pl-4">
            {events.map((event) => (
              <div key={event.id} className="relative">
                <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary" />
                <p className="text-sm">{event.message}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(event.createdAt).toLocaleString("pt-BR")}
                </p>
              </div>
            ))}
            {events.length === 0 && (
              <p className="text-sm text-muted-foreground">Sem histórico ainda.</p>
            )}
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
              placeholder="Escreva um comentário"
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              rows={2}
            />
            <Button type="submit" size="sm" disabled={commentMutation.isPending}>
              Comentar
            </Button>
          </form>

          <div className="space-y-3">
            {comments.map((comment) => {
              const isOfficial = comment.authorRole === "sindico";
              const canEditComment = !!user && (user.id === comment.authorId || isStaff);
              const isEditingThis = editingCommentId === comment.id;
              return (
                <div
                  key={comment.id}
                  className={cn(
                    "rounded-md border p-3 text-sm",
                    isOfficial && "border-brand-cyan/50 bg-brand-cyan/10",
                  )}
                >
                  {isOfficial && (
                    <Badge variant="secondary" className="mb-1.5 bg-brand-cyan/20 text-brand-cyan">
                      Resposta oficial
                    </Badge>
                  )}
                  {isEditingThis ? (
                    <form onSubmit={handleEditComment} className="space-y-2">
                      <Textarea
                        value={editingCommentBody}
                        onChange={(e) => setEditingCommentBody(e.target.value)}
                        rows={2}
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <Button type="submit" size="sm" disabled={editCommentMutation.isPending}>
                          Salvar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingCommentId(null)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <p>{comment.body}</p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          {comment.authorName} · {new Date(comment.createdAt).toLocaleString("pt-BR")}
                          {comment.updatedAt && " · editado"}
                        </span>
                        {canEditComment && (
                          <button
                            type="button"
                            className="ml-auto underline hover:text-foreground"
                            onClick={() => startEditingComment(comment)}
                          >
                            Editar
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            {comments.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum comentário ainda.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
