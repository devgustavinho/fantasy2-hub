import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import * as servicesApi from "@/services/services";
import { resolveMediaUrl } from "@/lib/api";
import type { SelectionType, ServiceItem, ServiceItemImage } from "@/lib/types";

const MAX_IMAGES = 5;

interface DraftOption {
  id: string;
  name: string;
  priceInput: string;
}

interface DraftGroup {
  id: string;
  name: string;
  selectionType: SelectionType;
  maxSelections: string;
  required: boolean;
  options: DraftOption[];
}

interface ItemDraft {
  name: string;
  description: string;
  price: string;
  isNegotiable: boolean;
  multipliable: boolean;
  maxQuantity: string;
  removedImageIds: string[];
  groups: DraftGroup[];
}

// Item novo ainda não tem id — usa um id local fixo por serviço (só um item pode estar "sendo
// adicionado" por vez nesta tela). Item existente usa o próprio id.
function draftKey(serviceId: string, itemId?: string) {
  return `fantasy2:item-draft:${itemId ?? `new:${serviceId}`}`;
}

function blankDraft(initial?: ServiceItem): ItemDraft {
  return {
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    price: initial && !initial.isNegotiable ? String(initial.priceCents / 100) : "",
    isNegotiable: initial?.isNegotiable ?? false,
    multipliable: !!initial?.maxQuantity,
    maxQuantity: initial?.maxQuantity ? String(initial.maxQuantity) : "5",
    removedImageIds: [],
    groups: (initial?.optionGroups ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      selectionType: g.selectionType,
      maxSelections: g.maxSelections ? String(g.maxSelections) : "2",
      required: g.required,
      options: g.options.map((o) => ({
        id: o.id,
        name: o.name,
        priceInput: o.priceDeltaCents ? String(o.priceDeltaCents / 100) : "0",
      })),
    })),
  };
}

function loadDraft(key: string, initial?: ServiceItem): { draft: ItemDraft; restored: boolean } {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return { draft: JSON.parse(raw) as ItemDraft, restored: true };
  } catch {
    // rascunho corrompido — ignora e começa do zero
  }
  return { draft: blankDraft(initial), restored: false };
}

// Edita o item inteiro (dados + fotos + grupos/opções de configuração) só localmente — nada
// vai pro servidor até clicar em "Salvar item". Isso troca o fluxo antigo de "salva, espera
// salvar, prossegue" (uma chamada de rede por grupo/opção) por no máximo 2 chamadas no fim
// (o item em si, depois o configurador inteiro de uma vez). O rascunho fica em localStorage
// pra sobreviver se a aba fechar/travar no meio da edição — exceto fotos novas, que não dá
// pra guardar em localStorage (precisam ser reanexadas se o rascunho for restaurado).
export function ItemEditor({
  serviceId,
  initial,
  onCancel,
  onSaved,
}: {
  serviceId: string;
  initial?: ServiceItem;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const key = draftKey(serviceId, initial?.id);
  const [{ draft: initialDraft, restored }] = useState(() => loadDraft(key, initial));

  const [name, setName] = useState(initialDraft.name);
  const [description, setDescription] = useState(initialDraft.description);
  const [price, setPrice] = useState(initialDraft.price);
  const [isNegotiable, setIsNegotiable] = useState(initialDraft.isNegotiable);
  const [multipliable, setMultipliable] = useState(initialDraft.multipliable);
  const [maxQuantity, setMaxQuantity] = useState(initialDraft.maxQuantity);
  const [existingImages, setExistingImages] = useState<ServiceItemImage[]>(
    (initial?.images ?? []).filter((img) => !initialDraft.removedImageIds.includes(img.id)),
  );
  const [removedImageIds, setRemovedImageIds] = useState<string[]>(initialDraft.removedImageIds);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [groups, setGroups] = useState<DraftGroup[]>(initialDraft.groups);
  const [showRestoredNotice, setShowRestoredNotice] = useState(restored);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const toSave: ItemDraft = {
      name,
      description,
      price,
      isNegotiable,
      multipliable,
      maxQuantity,
      removedImageIds,
      groups,
    };
    try {
      localStorage.setItem(key, JSON.stringify(toSave));
    } catch {
      // localStorage cheio/indisponível — segue sem persistir, não é crítico
    }
  }, [key, name, description, price, isNegotiable, multipliable, maxQuantity, removedImageIds, groups]);

  function discardDraft() {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignora
    }
  }

  function handleCancel() {
    discardDraft();
    onCancel();
  }

  function handleDiscardRestored() {
    discardDraft();
    const blank = blankDraft(initial);
    setName(blank.name);
    setDescription(blank.description);
    setPrice(blank.price);
    setIsNegotiable(blank.isNegotiable);
    setMultipliable(blank.multipliable);
    setMaxQuantity(blank.maxQuantity);
    setExistingImages(initial?.images ?? []);
    setRemovedImageIds([]);
    setNewImages([]);
    setGroups(blank.groups);
    setShowRestoredNotice(false);
  }

  const remainingSlots = MAX_IMAGES - existingImages.length - newImages.length;

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const picked = Array.from(files).slice(0, Math.max(0, remainingSlots));
    setNewImages((current) => [...current, ...picked]);
  }
  function removeExisting(id: string) {
    setExistingImages((current) => current.filter((img) => img.id !== id));
    setRemovedImageIds((current) => [...current, id]);
  }
  function removeNew(index: number) {
    setNewImages((current) => current.filter((_, i) => i !== index));
  }

  function addGroup() {
    setGroups((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: "", selectionType: "single", maxSelections: "2", required: false, options: [] },
    ]);
  }
  function updateGroup(groupId: string, patch: Partial<DraftGroup>) {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, ...patch } : g)));
  }
  function removeGroup(groupId: string) {
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
  }
  function addOption(groupId: string) {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, options: [...g.options, { id: crypto.randomUUID(), name: "", priceInput: "0" }] }
          : g,
      ),
    );
  }
  function updateOption(groupId: string, optionId: string, patch: Partial<DraftOption>) {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, options: g.options.map((o) => (o.id === optionId ? { ...o, ...patch } : o)) }
          : g,
      ),
    );
  }
  function removeOption(groupId: string, optionId: string) {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, options: g.options.filter((o) => o.id !== optionId) } : g)),
    );
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const priceNumber = isNegotiable ? 0 : Number(price.replace(",", "."));
      const itemInput: servicesApi.ServiceItemInput = {
        name: name.trim(),
        description: description.trim(),
        price: priceNumber,
        isNegotiable,
        maxQuantity: multipliable ? Number(maxQuantity) || 1 : null,
        images: newImages,
        removeImageIds: removedImageIds,
      };

      let itemId: string;
      if (initial) {
        await servicesApi.editServiceItem(initial.id, itemInput);
        itemId = initial.id;
      } else {
        itemId = (await servicesApi.addServiceItem(itemInput)).itemId;
      }

      const groupsPayload = groups
        .filter((g) => g.name.trim())
        .map((g) => ({
          name: g.name.trim(),
          selectionType: g.selectionType,
          maxSelections: g.selectionType === "multi" ? Number(g.maxSelections) || 1 : null,
          required: g.required,
          options: g.options
            .filter((o) => o.name.trim())
            .map((o) => ({
              name: o.name.trim(),
              priceDeltaCents: Math.round(Number(o.priceInput.replace(",", ".") || "0") * 100),
            })),
        }));
      await servicesApi.replaceOptionGroups(itemId, groupsPayload);
    },
    onSuccess: () => {
      discardDraft();
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["my-service"] });
      onSaved();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Erro ao salvar item."),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const priceNumber = isNegotiable ? 0 : Number(price.replace(",", "."));
    if (!name.trim() || Number.isNaN(priceNumber)) return;
    for (const group of groups) {
      if (group.selectionType === "multi" && group.name.trim() && !Number(group.maxSelections)) {
        setError(`Informe o máximo de opções pro grupo "${group.name}".`);
        return;
      }
    }
    setError(null);
    saveMutation.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-md border p-3">
      {showRestoredNotice && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-brand-gold/40 bg-brand-gold/10 p-2 text-xs">
          <span>
            Rascunho não salvo recuperado.
            {newImages.length === 0 && " Fotos novas precisam ser reanexadas."}
          </span>
          <button type="button" onClick={handleDiscardRestored} className="shrink-0 underline">
            Descartar rascunho
          </button>
        </div>
      )}

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

      <div className="space-y-2 rounded-md border bg-muted/20 p-3">
        <p className="text-sm font-medium">Opções de configuração (ex: toppings, sabores, cobertura)</p>
        {groups.map((group) => (
          <div key={group.id} className="rounded border bg-background p-2">
            <div className="flex items-start justify-between gap-2">
              <div className="grid flex-1 gap-1.5 sm:grid-cols-2">
                <Input
                  placeholder="Nome do grupo (ex: Toppings)"
                  value={group.name}
                  onChange={(e) => updateGroup(group.id, { name: e.target.value })}
                  className="h-8 text-xs"
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  <select
                    value={group.selectionType}
                    onChange={(e) => updateGroup(group.id, { selectionType: e.target.value as SelectionType })}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="single">Escolhe 1</option>
                    <option value="multi">Escolhe várias</option>
                  </select>
                  {group.selectionType === "multi" && (
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      className="h-8 w-16 text-xs"
                      value={group.maxSelections}
                      onChange={(e) => updateGroup(group.id, { maxSelections: e.target.value })}
                    />
                  )}
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={group.required}
                      onChange={(e) => updateGroup(group.id, { required: e.target.checked })}
                    />
                    Obrigatório
                  </label>
                </div>
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={() => removeGroup(group.id)}>
                Excluir grupo
              </Button>
            </div>

            <div className="mt-2 space-y-1.5">
              {group.options.map((option) => (
                <div key={option.id} className="flex items-center gap-1.5">
                  <Input
                    placeholder="Nome da opção"
                    value={option.name}
                    onChange={(e) => updateOption(group.id, option.id, { name: e.target.value })}
                    className="h-8 flex-1 text-xs"
                  />
                  {!isNegotiable && (
                    <Input
                      placeholder="+/- R$"
                      value={option.priceInput}
                      onChange={(e) => updateOption(group.id, option.id, { priceInput: e.target.value })}
                      className="h-8 w-20 text-xs"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => removeOption(group.id, option.id)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remover opção"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => addOption(group.id)}
              className="mt-1.5 text-xs text-primary underline"
            >
              + opção
            </button>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={addGroup}>
          + Grupo de opção
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Salvando..." : "Salvar item"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={handleCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
