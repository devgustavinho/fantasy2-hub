import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ImagePlus, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { QueryError } from "@/components/QueryError";
import { Markdown } from "@/components/Markdown";
import * as welcomeService from "@/services/welcome";

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

function printPoster(dataUrl: string, url: string) {
  const poster = window.open("", "_blank", "noopener,noreferrer");
  if (!poster) return;
  poster.document.write(`<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>QR Code — Fantasy 2</title>
    <style>
      body { margin: 0; font-family: system-ui, sans-serif; color: #01333d; }
      .sheet {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 32px;
        box-sizing: border-box;
      }
      h1 { font-size: 28px; margin: 0 0 8px; }
      p { margin: 0 0 24px; font-size: 18px; }
      img { width: 280px; height: 280px; }
      small { display: block; margin-top: 16px; color: #555; }
    </style>
  </head>
  <body>
    <div class="sheet">
      <h1>Fantasy 2</h1>
      <p>Aponte a câmera para ver as regras do condomínio</p>
      <img src="${dataUrl}" alt="QR Code das regras do condomínio" />
      <small>${url}</small>
    </div>
  </body>
</html>`);
  poster.document.close();
  poster.focus();
  poster.print();
}

function QrCard({
  url,
  dataUrl,
  copied,
  onCopy,
}: {
  url: string;
  dataUrl: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
      <img
        src={dataUrl}
        alt="QR Code da página de boas-vindas"
        className="h-48 w-48 rounded-md border bg-white p-2"
      />
      <div className="space-y-3">
        <p className="max-w-sm text-sm text-muted-foreground">
          Imprima e cole no elevador. Quem apontar a câmera abre as regras, sem precisar de conta.
        </p>
        <p className="break-all text-sm font-medium">{url}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onCopy}>
            {copied ? "Link copiado" : "Copiar link"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => downloadDataUrl(dataUrl, "fantasy2-boas-vindas-qr.png")}
          >
            <Download className="h-3.5 w-3.5" />
            Baixar PNG
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => printPoster(dataUrl, url)}>
            <Printer className="h-3.5 w-3.5" />
            Imprimir cartaz
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function WelcomeAdmin() {
  const queryClient = useQueryClient();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const pageQuery = useQuery({ queryKey: ["welcome"], queryFn: welcomeService.getWelcome });
  const qrQuery = useQuery({ queryKey: ["welcome-qr"], queryFn: welcomeService.getWelcomeQr });

  useEffect(() => {
    if (!pageQuery.data || hydrated) return;
    setTitle(pageQuery.data.title);
    setBody(pageQuery.data.body);
    setHydrated(true);
  }, [pageQuery.data, hydrated]);

  const saveMutation = useMutation({
    mutationFn: () => welcomeService.updateWelcome({ title, body }),
    onSuccess: (page) => {
      setSaveError(null);
      setTitle(page.title);
      setBody(page.body);
      queryClient.setQueryData(["welcome"], page);
    },
    onError: (err) => setSaveError(err instanceof Error ? err.message : "Erro ao salvar."),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => welcomeService.uploadWelcomeImage(file),
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
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    saveMutation.mutate();
  }

  async function copyUrl() {
    if (!qrQuery.data) return;
    await navigator.clipboard.writeText(qrQuery.data.url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Página de boas-vindas</h1>
          <p className="text-sm text-muted-foreground">
            Texto público das regras do condomínio. O QR Code abaixo aponta para essa página.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/boas-vindas">Ver página pública</Link>
        </Button>
      </div>

      {pageQuery.isLoading && <p className="text-muted-foreground">Carregando...</p>}
      {pageQuery.isError && <QueryError onRetry={() => pageQuery.refetch()} />}

      {pageQuery.data && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Texto da página</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="welcome-title">Título</Label>
                <Input
                  id="welcome-title"
                  required
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="welcome-body">Texto (markdown)</Label>
                <Textarea
                  id="welcome-body"
                  ref={bodyRef}
                  required
                  rows={16}
                  placeholder="Escreva em markdown — **negrito**, listas, links..."
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed px-3 py-1.5 text-xs text-muted-foreground hover:border-primary/50">
                  <ImagePlus className="h-3.5 w-3.5" />
                  {uploadMutation.isPending ? "Enviando..." : "Inserir imagem"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadMutation.isPending}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadMutation.mutate(file);
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
                    <Markdown size="lg">{body}</Markdown>
                  </div>
                </div>
              )}

              {saveError && <p className="text-sm text-destructive">{saveError}</p>}
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Salvando..." : "Publicar"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">QR Code do elevador</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {qrQuery.isLoading && <p className="text-sm text-muted-foreground">Gerando QR Code...</p>}
          {qrQuery.isError && <QueryError onRetry={() => qrQuery.refetch()} />}
          {qrQuery.data && (
            <QrCard
              url={qrQuery.data.url}
              dataUrl={qrQuery.data.dataUrl}
              copied={copied}
              onCopy={copyUrl}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
