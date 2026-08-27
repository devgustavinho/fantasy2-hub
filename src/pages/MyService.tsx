import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import * as servicesApi from "@/services/services";
import { API_URL } from "@/lib/api";
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
    images: File[];
    removeImageIds: string[];
  }) => void;
  onCancel?: () => void;
  pending: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [price, setPrice] = useState(initial ? String(initial.priceCents / 100) : "");
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
    const priceNumber = Number(price.replace(",", "."));
    if (!name.trim() || Number.isNaN(priceNumber)) return;
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      price: priceNumber,
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
            required
          />
        </div>
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
              <img src={`${API_URL}${img.path}`} alt="" className="h-full w-full object-cover" />
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
  const [error, setError] = useState<string | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["my-service"], queryFn: servicesApi.getMyService });

  useEffect(() => {
    if (data?.service) {
      setName(data.service.name);
      setDescription(data.service.description ?? "");
    }
  }, [data?.service]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["my-service"] });
    queryClient.invalidateQueries({ queryKey: ["services"] });
  }

  const createMutation = useMutation({
    mutationFn: () => servicesApi.createService({ name, description, whatsapp }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Erro ao cadastrar serviço."),
  });

  const updateMutation = useMutation({
    mutationFn: () => servicesApi.updateService({ name, description }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: servicesApi.deleteService,
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

  const service = data?.service ?? null;

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !whatsapp.trim()) {
      setError("Preencha o nome do serviço e um WhatsApp válido.");
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
              Ao cadastrar um serviço, seu WhatsApp fica visível para os outros moradores — é assim que
              eles entram em contato para comprar ou contratar.
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
                <Label>WhatsApp</Label>
                <Input
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="(11) 91234-5678"
                  required
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
            <CardContent>
              <form onSubmit={handleUpdate} className="space-y-3">
                <div className="space-y-1">
                  <Label>Nome do serviço</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label>Descrição</Label>
                  <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
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
                  <div key={item.id} className="flex items-center gap-3 rounded-md border p-2">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-muted/40">
                      {item.images.length > 0 ? (
                        <img
                          src={`${API_URL}${item.images[0].path}`}
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
                        {formatCentsToBRL(item.priceCents)}
                        {item.images.length > 1 ? ` · ${item.images.length} fotos` : ""}
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
