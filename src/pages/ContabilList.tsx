import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { QueryError } from "@/components/QueryError";
import { useAuth } from "@/contexts/AuthContext";
import { BALANCETE_STATUS_META, formatReferenceMonth } from "@/lib/contabilLabels";
import { activeIsStaff } from "@/lib/roles";
import * as contabilService from "@/services/contabil";

export default function ContabilList() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  // Publicar só no modo staff (admin/síndico). Morador e conselheiro: só leitura da lista.
  const canPublish = activeIsStaff(user?.role);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["contabil"],
    queryFn: contabilService.listBalancetes,
  });

  const [publishOpen, setPublishOpen] = useState(false);
  const [referenceMonth, setReferenceMonth] = useState("");
  const [pdf, setPdf] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const publishMutation = useMutation({
    mutationFn: () => contabilService.publishBalancete({ referenceMonth, pdf: pdf! }),
    onSuccess: () => {
      setPublishOpen(false);
      setReferenceMonth("");
      setPdf(null);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["contabil"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Erro ao publicar."),
  });

  function onPdfChange(file: File | null) {
    setPdf(file);
    if (file && file.size > contabilService.MAX_BALANCETE_PDF_BYTES) {
      setError(contabilService.balancetePdfTooLargeMessage(file.size));
      return;
    }
    setError(null);
  }

  function handlePublish(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!pdf) {
      setError("Anexe o PDF do balancete.");
      return;
    }
    if (pdf.size > contabilService.MAX_BALANCETE_PDF_BYTES) {
      setError(contabilService.balancetePdfTooLargeMessage(pdf.size));
      return;
    }
    publishMutation.mutate();
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-4xl space-y-5 overflow-x-hidden px-4 py-6 pb-8">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Organização contábil</h1>
          <p className="text-sm text-muted-foreground">
            {canPublish
              ? "Publique balancetes e acompanhe os pareceres do conselho."
              : "Consulte balancetes mensais e pareceres finalizados do conselho."}
          </p>
        </div>
        {canPublish && (
          <Button className="w-full shrink-0 sm:w-auto" onClick={() => setPublishOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Publicar balancete
          </Button>
        )}
      </div>

      {isLoading && <p className="text-muted-foreground">Carregando...</p>}
      {isError && <QueryError onRetry={() => refetch()} />}

      {!isLoading && !isError && (data?.balancetes.length ?? 0) === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhum balancete publicado ainda.</p>
          </CardContent>
        </Card>
      )}

      <div className="flex min-w-0 flex-col gap-3">
        {data?.balancetes.map((item) => {
          const meta = BALANCETE_STATUS_META[item.status];
          return (
            <Link key={item.id} to={`/contabil/${item.id}`} className="min-w-0 block">
              <Card className="min-w-0 transition-colors hover:border-primary/40">
                <CardContent className="flex min-w-0 flex-col gap-3 p-4">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold">{item.title}</p>
                      <p className="text-xs text-muted-foreground">
                        Ref. {formatReferenceMonth(item.referenceMonth)} · por {item.publishedByName}
                      </p>
                    </div>
                    <Badge variant={meta.badge} className="shrink-0 whitespace-nowrap">
                      {meta.label}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {item.parecerFinalizados} de {item.parecerTotal} pareceres
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <BottomSheet
        open={publishOpen}
        onClose={() => {
          if (!publishMutation.isPending) setPublishOpen(false);
        }}
        title="Publicar balancete"
        description="Envie o PDF mensal para análise do conselho."
      >
        <form onSubmit={handlePublish} className="space-y-4 overflow-y-auto px-4 pb-6">
          <div className="space-y-2">
            <Label htmlFor="referenceMonth">Mês de referência</Label>
            <Input
              id="referenceMonth"
              type="month"
              required
              value={referenceMonth}
              onChange={(e) => setReferenceMonth(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pdf">PDF do balancete</Label>
            <Input
              id="pdf"
              type="file"
              accept="application/pdf,.pdf"
              required
              onChange={(e) => onPdfChange(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">
              Tamanho máximo: {contabilService.MAX_BALANCETE_PDF_MB} MB.
            </p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={publishMutation.isPending}>
            {publishMutation.isPending ? "Publicando..." : "Publicar"}
          </Button>
        </form>
      </BottomSheet>
    </div>
  );
}
