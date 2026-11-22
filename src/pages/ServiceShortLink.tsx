import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import * as servicesApi from "@/services/services";

export default function ServiceShortLink() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const valid = !!slug && /^[A-Za-z0-9][A-Za-z0-9_-]{2,47}$/.test(slug);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["service-slug", slug],
    queryFn: () => servicesApi.resolveServiceSlug(slug!),
    enabled: valid,
    retry: false,
  });

  useEffect(() => {
    if (data?.serviceId) {
      navigate(`/negocios/${data.serviceId}`, { replace: true });
    }
  }, [data, navigate]);

  if (!valid || isError) {
    return (
      <div className="mx-auto max-w-md space-y-3 px-4 py-16 text-center">
        <p className="text-muted-foreground">Link de negócio inválido ou não encontrado.</p>
        <Link to="/negocios" className="text-sm text-primary underline-offset-4 hover:underline">
          Ir para Negócios
        </Link>
      </div>
    );
  }

  if (isLoading || data?.serviceId) {
    return <p className="mx-auto max-w-4xl px-4 py-8 text-muted-foreground">Abrindo negócio...</p>;
  }

  return null;
}
