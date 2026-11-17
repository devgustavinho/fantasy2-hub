import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TopicSortControl } from "@/components/TopicSortControl";
import { QueryError } from "@/components/QueryError";
import { DEFAULT_TOPIC_SORT, parseTopicSort } from "@/lib/topicSort";
import { formatDateOnly } from "@/lib/utils";
import * as topicsService from "@/services/topics";

export default function TopicsHistory() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sort = parseTopicSort(searchParams.get("sort"));

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["topics", "scheduled", sort],
    queryFn: () => topicsService.listTopics("scheduled", sort),
  });

  function handleSortChange(next: typeof sort) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next === DEFAULT_TOPIC_SORT) params.delete("sort");
        else params.set("sort", next);
        return params;
      },
      { replace: true },
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Histórico de pautas</h1>
          <p className="text-sm text-muted-foreground">
            Pautas já marcadas como pautadas para assembleia.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/pautas">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Pautas em aberto
          </Link>
        </Button>
      </div>

      <TopicSortControl value={sort} onChange={handleSortChange} />

      {isLoading && <p className="text-muted-foreground">Carregando...</p>}
      {isError && <QueryError onRetry={() => refetch()} />}

      <div className="space-y-3">
        {data?.topics.map((topic) => (
          <Link key={topic.id} to={`/topics/${topic.id}`}>
            <Card className="transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{topic.title}</CardTitle>
                  <Badge variant="success">
                    Pautada {topic.assemblyDate ? `em ${formatDateOnly(topic.assemblyDate)}` : ""}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex items-center gap-4 pt-0 text-sm text-muted-foreground">
                <span>👍 {topic.favorCount}</span>
                <span>👎 {topic.contraCount}</span>
                <span>💬 {topic.commentCount ?? 0}</span>
                <span className="ml-auto">por {topic.createdByName}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
        {data && data.topics.length === 0 && (
          <p className="text-muted-foreground">Nenhuma pauta pautada ainda.</p>
        )}
      </div>
    </div>
  );
}
