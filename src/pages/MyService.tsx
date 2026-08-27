import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OptionGroupsManager } from "@/components/OptionGroupsManager";
import { QueryError } from "@/components/QueryError";
import { useAuth } from "@/contexts/AuthContext";
import * as servicesApi from "@/services/services";
import { resolveMediaUrl } from "@/lib/api";
import { formatCentsToBRL } from "@/lib/utils";
import type { ServiceItem } from "@/lib/types";

const MAX_IMAGES = 5;

function ItemForm({
  initial,
  onSubmit,
  onCancel,
  pending,
}: {
  initial?: ServiceItem;
  onSubmit: (data: {
    name: string;
    description: string;
    price: number;
    isNegotiable: boolean;
    maxQuantity: number | null;
    images: File[];
    removeImageIds: string[];
  }) => void;
  onCancel?: () => void;
  pending: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [price, setPrice] = useState(initial && !initial.isNegotiable ? String(initial.priceCents / 100) : "");
  const [isNegotiable, setIsNegotiable] = useState(initial?.isNegotiable ?? false);
  const [multipliable, setMultipliable] = useState(!!initial?.maxQuantity);
  const [maxQuantity, setMaxQuantity] = useState(initial?.maxQuantity ? String(initial.maxQuantity) : "5");
  const [existingImages, setExistingImages] = useState(initial?.images ?? []);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [newImages, setNewImages] = useState<File[]>([]);

  const remainingSlots = MAX_IMAGES - existingImages.length - newImages.length;

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const picked = Array.from(files).slice(0, Math.max(0, remainingSlots));
    setNewImages((current) => [...current, ...picked]);
  }

  function removeExisting(id: string) {
    setExistingImages((current) => current.filter((img) => img.id !== id));
    setRemovedIds((current) => [...current, id]);
  }

  function removeNew(index: number) {
    setNewImages((current) => current.filter((_, i) => i !== index));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const priceNumber = isNegotiable ? 0 : Number(price.replace(",", "."));
    if (!name.trim() || Number.isNaN(priceNumber)) return;
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      price: priceNumber,
      isNegotiable,
      maxQuantity: multipliable ? Number(maxQuantity) || 1 : null,
      images: newImages,
      removeImageIds: removedIds,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-md border p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Nome do item</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label>Preço (R$)</Label>
          <Input
            inputMode="decimal"
            placeholder="0,00"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            disabled={isNegotiable}
            required={!isNegotiable}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isNegotiable} onChange={(e) => setIsNegotiable(e.target.checked)} />
        Preço "a negociar" (sem valor fixo)
      </label>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={multipliable} onChange={(e) => setMultipliable(e.target.checked)} />
          Cliente pode pedir mais de 1
        </label>
        {multipliable && (
          <Input
            type="number"
            min={2}
            max={99}
            className="h-8 w-20"
            value={maxQuantity}
            onChange={(e) => setMaxQuantity(e.target.value)}
          />
        )}
      </div>
      <div className="space-y-1">
        <Label>Descrição</Label>
        <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Fotos (até {MAX_IMAGES})</Label>
        <div className="flex flex-wrap gap-2">
          {existingImages.map((img) => (
            <div key={img.id} className="relative h-16 w-16 overflow-hidden rounded border">
              <img src={resolveMediaUrl(img.path)} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeExisting(img.id)}
                className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
                aria-label="Remover foto"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {newImages.map((file, idx) => (
            <div key={idx} className="relative h-16 w-16 overflow-hidden rounded border">
              <img src={URL.createObjectURL(file)} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeNew(idx)}
                className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
                aria-label="Remover foto"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {remainingSlots > 0 && (
            <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded border border-dashed text-[10px] text-muted-foreground hover:border-primary/50">
              + foto
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  handleFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Salvando..." : "Salvar item"}
        </Button>
        {onCancel && (
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}

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
  const [optionsItemId, setOptionsItemId] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

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
    mutationFn: () => servicesApi.createService({ name, description, whatsapp: whatsapp || undefined, instagram: instagram || undefined }),
    onSuccess: () => {
      setError(null);
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

  const [itemError, setItemError] = useState<string | null>(null);

  const addItemMutation = useMutation({
    mutationFn: (input: servicesApi.ServiceItemInput) => servicesApi.addServiceItem(input),
    onSuccess: () => {
      setItemError(null);
      setAddingItem(false);
      invalidate();
    },
    onError: (err) => setItemError(err instanceof Error ? err.message : "Erro ao salvar item."),
  });

  const editItemMutation = useMutation({
    mutationFn: (input: servicesApi.ServiceItemInput) => servicesApi.editServiceItem(editingItemId!, input),
    onSuccess: () => {
      setItemError(null);
      setEditingItemId(null);
      invalidate();
    },
    onError: (err) => setItemError(err instanceof Error ? err.message : "Erro ao salvar item."),
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
              {itemError && <p className="text-sm text-destructive">{itemError}</p>}
              {service.items.map((item) =>
                editingItemId === item.id ? (
                  <ItemForm
                    key={item.id}
                    initial={item}
                    pending={editItemMutation.isPending}
                    onCancel={() => setEditingItemId(null)}
                    onSubmit={(input) => editItemMutation.mutate(input)}
                  />
                ) : (
                  <div key={item.id} className="space-y-2">
                    <div className="flex flex-wrap items-center gap-3 rounded-md border p-2">
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
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setOptionsItemId(optionsItemId === item.id ? null : item.id)}
                      >
                        Opções
                      </Button>
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
                    {optionsItemId === item.id && <OptionGroupsManager item={item} />}
                  </div>
                ),
              )}
              {service.items.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum item cadastrado ainda.</p>
              )}

              {addingItem ? (
                <ItemForm
                  pending={addItemMutation.isPending}
                  onCancel={() => setAddingItem(false)}
                  onSubmit={(input) => addItemMutation.mutate(input)}
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
