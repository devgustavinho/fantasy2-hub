import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { QueryError } from "@/components/QueryError";
import { Markdown } from "@/components/Markdown";
import { useAuth } from "@/contexts/AuthContext";
import * as faqService from "@/services/faq";
import type { FaqEntry } from "@/lib/types";

function FaqEditor({
  initialQuestion = "",
  initialBody = "",
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  initialQuestion?: string;
  initialBody?: string;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (data: { question: string; body: string }) => void;
  onCancel?: () => void;
}) {
  const [question, setQuestion] = useState(initialQuestion);
  const [body, setBody] = useState(initialBody);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => faqService.uploadFaqImage(file),
    onSuccess: ({ url }) => {
      const textarea = bodyRef.current;
      const markdown = `![](${url})`;
      if (textarea) {
        const start = textarea.selectionStart ?? body.length;
        const end = textarea.selectionEnd ?? body.length;
        const next = `${body.slice(0, start)}${markdown}${body.slice(end)}`;
        setBody(next);
        requestAnimationFrame(() => {
          textarea.focus();
          textarea.selectionStart = textarea.selectionEnd = start + markdown.length;
        });
      } else {
        setBody((current) => `${current}\n${markdown}`);
      }
      setUploadError(null);
    },
    onError: (err) => setUploadError(err instanceof Error ? err.message : "Erro ao enviar imagem."),
    onSettled: () => setUploading(false),
  });

  function handleFile(file: File | null) {
    if (!file) return;
    setUploading(true);
    uploadMutation.mutate(file);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({ question, body });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="faq-question">Pergunta</Label>
        <Input id="faq-question" required value={question} onChange={(e) => setQuestion(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="faq-body">Resposta (markdown)</Label>
        <Textarea
          id="faq-body"
          ref={bodyRef}
          required
          rows={6}
          placeholder="Escreva em markdown — **negrito**, listas, links..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed px-3 py-1.5 text-xs text-muted-foreground hover:border-primary/50">
          <ImagePlus className="h-3.5 w-3.5" />
          {uploading ? "Enviando..." : "Inserir imagem"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              handleFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </label>
        {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
      </div>

      {body.trim() && (
        <div className="space-y-1">
          <Label>Pré-visualização</Label>
          <div className="rounded-md border bg-muted/30 p-3">
            <Markdown>{body}</Markdown>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Salvando..." : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}

function FaqCard({ entry, isAdmin }: { entry: FaqEntry; isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const editMutation = useMutation({
    mutationFn: (data: { question: string; body: string }) => faqService.updateFaq(entry.id, data),
    onSuccess: () => {
      setIsEditing(false);
      setEditError(null);
      queryClient.invalidateQueries({ queryKey: ["faq"] });
    },
    onError: (err) => setEditError(err instanceof Error ? err.message : "Erro ao salvar."),
  });

  const deleteMutation = useMutation({
    mutationFn: () => faqService.deleteFaq(entry.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["faq"] }),
  });

  function handleDelete() {
    if (window.confirm(`Excluir a pergunta "${entry.question}"? Essa ação não pode ser desfeita.`)) {
      deleteMutation.mutate();
    }
  }

  if (isEditing) {
    return (
      <Card>
        <CardContent className="pt-6">
          <FaqEditor
            initialQuestion={entry.question}
            initialBody={entry.body}
            submitLabel="Salvar"
            pending={editMutation.isPending}
            error={editError}
            onSubmit={(data) => editMutation.mutate(data)}
            onCancel={() => setIsEditing(false)}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{entry.question}</CardTitle>
          {isAdmin && (
            <div className="flex shrink-0 gap-1.5">
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={deleteMutation.isPending}
                onClick={handleDelete}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Markdown>{entry.body}</Markdown>
      </CardContent>
    </Card>
  );
}

export default function Faq() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "admin";

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["faq"], queryFn: faqService.listFaq });

  const [showForm, setShowForm] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: { question: string; body: string }) => faqService.createFaq(data),
    onSuccess: () => {
      setShowForm(false);
      setCreateError(null);
      queryClient.invalidateQueries({ queryKey: ["faq"] });
    },
    onError: (err) => setCreateError(err instanceof Error ? err.message : "Erro ao criar pergunta."),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Perguntas frequentes</h1>
          <p className="text-sm text-muted-foreground">Dúvidas comuns sobre o condomínio.</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowForm((v) => !v)}>{showForm ? "Cancelar" : "Nova pergunta"}</Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Nova pergunta</CardTitle>
          </CardHeader>
          <CardContent>
            <FaqEditor
              submitLabel="Publicar"
              pending={createMutation.isPending}
              error={createError}
              onSubmit={(data) => createMutation.mutate(data)}
            />
          </CardContent>
        </Card>
      )}

      {isLoading && <p className="text-muted-foreground">Carregando...</p>}
      {isError && <QueryError onRetry={() => refetch()} />}

      <div className="space-y-4">
        {data?.entries.map((entry) => (
          <FaqCard key={entry.id} entry={entry} isAdmin={isAdmin} />
        ))}
        {data && data.entries.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma pergunta cadastrada ainda.</p>
        )}
      </div>
    </div>
  );
}
