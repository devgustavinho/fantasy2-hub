import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import * as topicsService from "@/services/topics";

export default function TopicShortLink() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["topic-share-code", code],
    queryFn: () => topicsService.resolveShareCode(code!),
    enabled: !!code && /^[A-Za-z0-9]{1,6}$/.test(code),
    retry: false,
  });

  useEffect(() => {
    if (data?.topicId) {
      navigate(`/topics/${data.topicId}`, { replace: true });
    }
  }, [data, navigate]);

  if (!code || !/^[A-Za-z0-9]{1,6}$/.test(code) || isError) {
    return (
      <div className="mx-auto max-w-md space-y-3 px-4 py-16 text-center">
        <p className="text-muted-foreground">Link de pauta inválido ou expirado.</p>
        <Link to="/pautas" className="text-sm text-primary underline-offset-4 hover:underline">
          Ir para pautas
        </Link>
      </div>
    );
  }

  if (isLoading || data?.topicId) {
    return <p className="mx-auto max-w-4xl px-4 py-8 text-muted-foreground">Abrindo pauta...</p>;
  }

  return null;
}
