import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ItemEditor } from "@/components/ItemEditor";
import { QueryError } from "@/components/QueryError";
import { useAuth } from "@/contexts/AuthContext";
import * as servicesApi from "@/services/services";
import { resolveMediaUrl } from "@/lib/api";
import { formatCentsToBRL } from "@/lib/utils";

export default function MyService() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [whatsapp, setWhatsapp] = useState(user?.whatsapp ?? "");
  const [instagram, setInstagram] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [newServicePhoto, setNewServicePhoto] = useState<File | null>(null);

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({ queryKey: ["my-service"], queryFn: servicesApi.getMyService });

  useEffect(() => {
    if (data?.service) {
      setName(data.service.name);
      setDescription(data.service.description ?? "");
      setInstagram(data.service.instagram ?? "");
      setWhatsapp(data.service.whatsapp ?? "");
    }
  }, [data?.service]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["my-service"] });
    queryClient.invalidateQueries({ queryKey: ["services"] });
  }

  const createMutation = useMutation({
    mutationFn: () =>
      servicesApi.createService({
        name,
        description,
        whatsapp: whatsapp || undefined,
        instagram: instagram || undefined,
        photo: newServicePhoto ?? undefined,
      }),
    onSuccess: () => {
      setError(null);
      setNewServicePhoto(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Erro ao cadastrar serviço."),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      servicesApi.updateService({ name, description, whatsapp: whatsapp || undefined, instagram: instagram || undefined }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: servicesApi.deleteService,
    onSuccess: invalidate,
  });

  const setPhotoMutation = useMutation({
    mutationFn: (file: File) => servicesApi.setServicePhoto(file),
    onSuccess: () => {
      setPhotoError(null);
      invalidate();
    },
    onError: (err) => setPhotoError(err instanceof Error ? err.message : "Erro ao enviar foto."),
  });

  const removePhotoMutation = useMutation({
    mutationFn: servicesApi.removeServicePhoto,
    onSuccess: invalidate,
  });

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: string) => servicesApi.deleteServiceItem(itemId),
    onSuccess: invalidate,
  });

  if (isLoading) {
    return <p className="mx-auto max-w-2xl px-4 py-8 text-muted-foreground">Carregando...</p>;
  }
  if (isError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <QueryError onRetry={() => refetch()} />
      </div>
    );
  }

  const service = data?.service ?? null;

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Preencha o nome do serviço.");
      return;
    }
    createMutation.mutate();
  }

  function handleUpdate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    updateMutation.mutate();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Meu serviço</h1>
        <Link to="/servicos" className="text-sm text-primary underline">
          Ver todos os serviços
        </Link>
      </div>

      {!service && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cadastrar serviço</CardTitle>
            <CardDescription>
              WhatsApp e Instagram são opcionais — informe pelo menos um pra outros moradores
              conseguirem te encontrar. Se preencher o WhatsApp, ele fica visível pros outros moradores.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="space-y-1">
                <Label>Nome do serviço</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Doces da Maria" required />
              </div>
              <div className="space-y-1">
                <Label>Descrição (opcional)</Label>
                <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>WhatsApp (opcional)</Label>
                <Input
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="(11) 91234-5678"
                />
              </div>
              <div className="space-y-1">
                <Label>Instagram (opcional)</Label>
                <Input
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                  placeholder="@doces.da.maria"
                />
              </div>
              <div className="space-y-1">
                <Label>Foto do serviço (opcional)</Label>
                {newServicePhoto ? (
                  <div className="relative h-32 w-full max-w-xs overflow-hidden rounded-md border">
                    <img
                      src={URL.createObjectURL(newServicePhoto)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setNewServicePhoto(null)}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                      aria-label="Remover foto"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <label className="flex h-32 w-full max-w-xs cursor-pointer items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground hover:border-primary/50">
                    + adicionar foto
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setNewServicePhoto(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Cadastrando..." : "Cadastrar serviço"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {service && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dados do serviço</CardTitle>
              {service.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {service.tags.map((tag) => (
                    <span key={tag.id} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      {tag.name}
                    </span>
                  ))}
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Foto do serviço (opcional)</Label>
                {service.imagePath ? (
                  <div className="relative h-32 w-full max-w-xs overflow-hidden rounded-md border">
                    <img src={resolveMediaUrl(service.imagePath)} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhotoMutation.mutate()}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                      aria-label="Remover foto"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <label className="flex h-32 w-full max-w-xs cursor-pointer items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground hover:border-primary/50">
                    {setPhotoMutation.isPending ? "Enviando..." : "+ adicionar foto"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setPhotoMutation.mutate(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
                {photoError && <p className="text-xs text-destructive">{photoError}</p>}
              </div>
              <form onSubmit={handleUpdate} className="space-y-3">
                <div className="space-y-1">
                  <Label>Nome do serviço</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label>Descrição</Label>
                  <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>WhatsApp (opcional)</Label>
                  <Input
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="(11) 91234-5678"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Instagram (opcional)</Label>
                  <Input
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                    placeholder="@doces.da.maria"
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={updateMutation.isPending}>
                    Salvar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (window.confirm("Excluir seu serviço e todos os itens cadastrados?")) {
                        deleteMutation.mutate();
                      }
                    }}
                  >
                    Excluir serviço
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Itens ({service.items.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {service.items.map((item) =>
                editingItemId === item.id ? (
                  <ItemEditor
                    key={item.id}
                    serviceId={service.id}
                    initial={item}
                    onCancel={() => setEditingItemId(null)}
                    onSaved={() => setEditingItemId(null)}
                  />
                ) : (
                  <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-md border p-2">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-muted/40">
                      {item.images.length > 0 ? (
                        <img
                          src={resolveMediaUrl(item.images[0].path)}
                          alt={item.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-[10px] text-muted-foreground">Sem foto</span>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.isNegotiable ? "A negociar" : formatCentsToBRL(item.priceCents)}
                        {item.images.length > 1 ? ` · ${item.images.length} fotos` : ""}
                        {item.optionGroups.length > 0 ? ` · ${item.optionGroups.length} grupo(s) de opção` : ""}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setEditingItemId(item.id)}>
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={deleteItemMutation.isPending}
                      onClick={() => deleteItemMutation.mutate(item.id)}
                    >
                      Excluir
                    </Button>
                  </div>
                ),
              )}
              {service.items.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum item cadastrado ainda.</p>
              )}

              {addingItem ? (
                <ItemEditor
                  serviceId={service.id}
                  onCancel={() => setAddingItem(false)}
                  onSaved={() => setAddingItem(false)}
                />
              ) : (
                <Button size="sm" variant="outline" onClick={() => setAddingItem(true)}>
                  Adicionar item
                </Button>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
