import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import * as topicsService from "@/services/topics";

export default function AdminPanel() {
  const { data, isLoading } = useQuery({ queryKey: ["topics"], queryFn: topicsService.listTopics });

  const sorted = [...(data?.topics ?? [])].sort((a, b) => {
    const balanceA = a.favorCount - a.contraCount;
    const balanceB = b.favorCount - b.contraCount;
    return balanceB - balanceA;
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Administração — reclamações mais relevantes</h1>
        <p className="text-sm text-muted-foreground">
          Ordenado por saldo de votos (favor − contra) para ajudar a montar a pauta da próxima assembleia.
        </p>
      </div>

      {isLoading && <p className="text-muted-foreground">Carregando...</p>}

      <div className="space-y-3">
        {sorted.map((topic, index) => (
          <Link key={topic.id} to={`/topics/${topic.id}`}>
            <Card className="transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    <span className="mr-2 text-muted-foreground">#{index + 1}</span>
                    {topic.title}
                  </CardTitle>
                  {topic.status === "scheduled" ? (
                    <Badge variant="success">Pautada</Badge>
                  ) : (
                    <Badge variant="secondary">Em aberto</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex items-center gap-4 pt-0 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  saldo {topic.favorCount - topic.contraCount >= 0 ? "+" : ""}
                  {topic.favorCount - topic.contraCount}
                </span>
                <span>👍 {topic.favorCount}</span>
                <span>👎 {topic.contraCount}</span>
                <span>💬 {topic.commentCount ?? 0}</span>
                <span className="ml-auto">por {topic.createdByName}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
        {data && data.topics.length === 0 && (
          <p className="text-muted-foreground">Nenhuma pauta cadastrada ainda.</p>
        )}
      </div>
    </div>
  );
}
