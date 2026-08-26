import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import * as topicsService from "@/services/topics";
import type { VoteValue } from "@/lib/types";
import { formatDateOnly } from "@/lib/utils";

export default function TopicDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [commentBody, setCommentBody] = useState("");
  const [assemblyDate, setAssemblyDate] = useState("");

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

  const scheduleMutation = useMutation({
    mutationFn: (date: string | null) => topicsService.scheduleTopic(id!, date),
    onSuccess: invalidate,
  });

  if (isLoading || !data) {
    return <p className="mx-auto max-w-4xl px-4 py-8 text-muted-foreground">Carregando...</p>;
  }

  const { topic, comments } = data;

  function handleComment(e: FormEvent) {
    e.preventDefault();
    if (!commentBody.trim()) return;
    commentMutation.mutate();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar para pautas
      </Link>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>{topic.title}</CardTitle>
            {topic.status === "scheduled" ? (
              <Badge variant="success">
                Pautada em {topic.assemblyDate ? formatDateOnly(topic.assemblyDate) : "-"}
              </Badge>
            ) : (
              <Badge variant="secondary">Em aberto</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="whitespace-pre-wrap text-sm">{topic.description}</p>
          <p className="text-xs text-muted-foreground">Criada por {topic.createdByName}</p>

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

          {(user?.role === "admin" || user?.role === "sindico") && (
            <div className="space-y-2 rounded-md border bg-muted/40 p-4">
              <p className="text-sm font-medium">Administração</p>
              {topic.status === "scheduled" ? (
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
              )}
            </div>
          )}
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
            {comments.map((comment) => (
              <div key={comment.id} className="rounded-md border p-3 text-sm">
                <p>{comment.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {comment.authorName} · {new Date(comment.createdAt).toLocaleString("pt-BR")}
                </p>
              </div>
            ))}
            {comments.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum comentário ainda.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
