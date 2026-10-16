import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { QueryError } from "@/components/QueryError";
import { useAuth } from "@/contexts/AuthContext";
import * as climateService from "@/services/climate";

interface DraftOption {
  key: string;
  label: string;
}

interface DraftQuestion {
  key: string;
  prompt: string;
  options: DraftOption[];
}

let draftSeq = 0;
function draftKey() {
  draftSeq += 1;
  return `q-${draftSeq}`;
}

function blankOption(): DraftOption {
  return { key: draftKey(), label: "" };
}

function blankQuestion(): DraftQuestion {
  return { key: draftKey(), prompt: "", options: [blankOption(), blankOption()] };
}

export default function ClimateList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "admin";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["climate"],
    queryFn: climateService.listSurveys,
  });

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [allowComments, setAllowComments] = useState(true);
  const [questions, setQuestions] = useState<DraftQuestion[]>([blankQuestion()]);
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      climateService.createSurvey({
        title,
        description,
        allowComments,
        questions: questions.map((question) => ({
          prompt: question.prompt,
          options: question.options.map((option) => option.label),
        })),
      }),
    onSuccess: ({ survey }) => {
      setTitle("");
      setDescription("");
      setAllowComments(true);
      setQuestions([blankQuestion()]);
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["climate"] });
      navigate(`/clima/${survey.id}`);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Erro ao criar a pesquisa."),
  });

  function updateQuestion(key: string, patch: Partial<DraftQuestion>) {
    setQuestions((current) => current.map((question) => (question.key === key ? { ...question, ...patch } : question)));
  }

  function updateOption(questionKey: string, optionKey: string, label: string) {
    setQuestions((current) =>
      current.map((question) =>
        question.key === questionKey
          ? {
              ...question,
              options: question.options.map((option) => (option.key === optionKey ? { ...option, label } : option)),
            }
          : question,
      ),
    );
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    createMutation.mutate();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Pesquisa de clima</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cada apartamento responde uma vez. Os resultados ficam visíveis em porcentagem.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowForm((open) => !open)}>{showForm ? "Cancelar" : "Nova pesquisa"}</Button>
        )}
      </div>

      {showForm && isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Nova pesquisa</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="climate-title">Título</Label>
                <Input
                  id="climate-title"
                  required
                  minLength={4}
                  maxLength={160}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="climate-description">Descrição (opcional)</Label>
                <Textarea
                  id="climate-description"
                  rows={3}
                  maxLength={2000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={allowComments}
                  onChange={(e) => setAllowComments(e.target.checked)}
                />
                Incluir aba de comentários gerais no final
              </label>

              <div className="space-y-4">
                {questions.map((question, index) => (
                  <div key={question.key} className="space-y-3 rounded-md border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor={`prompt-${question.key}`}>Pergunta {index + 1}</Label>
                      {questions.length > 1 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setQuestions((current) => current.filter((item) => item.key !== question.key))}
                        >
                          <Trash2 className="h-4 w-4" />
                          Remover
                        </Button>
                      )}
                    </div>
                    <Input
                      id={`prompt-${question.key}`}
                      required
                      minLength={2}
                      maxLength={300}
                      placeholder="Enunciado da pergunta"
                      value={question.prompt}
                      onChange={(e) => updateQuestion(question.key, { prompt: e.target.value })}
                    />
                    <div className="space-y-2">
                      {question.options.map((option, optionIndex) => (
                        <div key={option.key} className="flex items-center gap-2">
                          <Input
                            required
                            maxLength={120}
                            placeholder={`Opção ${optionIndex + 1}`}
                            aria-label={`Opção ${optionIndex + 1} da pergunta ${index + 1}`}
                            value={option.label}
                            onChange={(e) => updateOption(question.key, option.key, e.target.value)}
                          />
                          {question.options.length > 2 && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              aria-label="Remover opção"
                              onClick={() =>
                                updateQuestion(question.key, {
                                  options: question.options.filter((item) => item.key !== option.key),
                                })
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                      {question.options.length < 12 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => updateQuestion(question.key, { options: [...question.options, blankOption()] })}
                        >
                          <Plus className="h-4 w-4" />
                          Opção
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {questions.length < 30 && (
                <Button type="button" variant="outline" onClick={() => setQuestions((current) => [...current, blankQuestion()])}>
                  <Plus className="h-4 w-4" />
                  Pergunta
                </Button>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Publicando..." : "Publicar pesquisa"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading && <p className="text-muted-foreground">Carregando...</p>}
      {isError && <QueryError onRetry={() => refetch()} />}

      <div className="space-y-3">
        {data?.surveys.map((survey) => (
          <Link key={survey.id} to={`/clima/${survey.id}`}>
            <Card className="transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{survey.title}</CardTitle>
                  <Badge variant={survey.status === "open" ? "success" : "secondary"}>
                    {survey.status === "open" ? "Aberta" : "Encerrada"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0 text-sm text-muted-foreground">
                <span>
                  {survey.responseCount} {survey.responseCount === 1 ? "apartamento" : "apartamentos"}
                </span>
                {survey.allowComments && <span>Com comentários</span>}
                <span className="ml-auto">por {survey.createdByName}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
        {data && data.surveys.length === 0 && (
          <p className="text-muted-foreground">Nenhuma pesquisa de clima publicada ainda.</p>
        )}
      </div>
    </div>
  );
}
