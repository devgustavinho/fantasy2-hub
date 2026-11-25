import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryError } from "@/components/QueryError";
import * as docsService from "@/services/docs";
import type { CondoDocument } from "@/services/docs";

function DocumentCard({ doc }: { doc: CondoDocument }) {
  const [busy, setBusy] = useState<"view" | "download" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isPdf = doc.contentType === "application/pdf";

  async function open(opts: { download?: boolean }) {
    setError(null);
    setBusy(opts.download ? "download" : "view");
    try {
      await docsService.openDocument(doc.path, {
        download: opts.download,
        filename: isPdf
          ? doc.id === "manual-do-proprietario"
            ? "Manual-do-Proprietario-Fantasy-2.pdf"
            : `${doc.id}.pdf`
          : undefined,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : opts.download
            ? "Falha ao baixar o documento."
            : "Falha ao abrir o documento.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4 shrink-0" />
          {doc.title}
        </CardTitle>
        {doc.description && <CardDescription>{doc.description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {isPdf ? (
          <>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="gap-1.5"
              disabled={busy !== null}
              onClick={() => open({})}
            >
              <FileText className="h-3.5 w-3.5" />
              {busy === "view" ? "Abrindo…" : "Abrir PDF"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={busy !== null}
              onClick={() => open({ download: true })}
            >
              <Download className="h-3.5 w-3.5" />
              {busy === "download" ? "Baixando…" : "Baixar"}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="default"
            size="sm"
            className="gap-1.5"
            disabled={busy !== null}
            onClick={() => open({})}
          >
            <FileText className="h-3.5 w-3.5" />
            {busy === "view" ? "Abrindo…" : "Abrir"}
          </Button>
        )}
        {error && <p className="w-full text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

export default function Documentos() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["docs"],
    queryFn: docsService.listDocuments,
  });

  const documents = data?.documents ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 pb-28">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <FolderOpen className="h-6 w-6" />
          Documentos
        </h1>
        <p className="text-sm text-muted-foreground">
          Manuais e documentos do condomínio para moradores aprovados.
        </p>
      </div>

      {isLoading && <p className="text-muted-foreground">Carregando...</p>}
      {isError && <QueryError onRetry={() => refetch()} />}

      {!isLoading && !isError && documents.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <FolderOpen className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhum documento disponível no momento.</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && documents.length > 0 && (
        <section className="space-y-3">
          {documents.map((doc) => (
            <DocumentCard key={doc.id} doc={doc} />
          ))}
        </section>
      )}
    </div>
  );
}
