import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DoorOpen, Globe, HandMetal, Package, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ItemEditor } from "@/components/ItemEditor";
import { QueryError } from "@/components/QueryError";
import { ShareCoverPicker } from "@/components/ShareCoverPicker";
import { WhatsAppShareCard } from "@/components/WhatsAppShareCard";
import { useAuth } from "@/contexts/AuthContext";
import * as servicesApi from "@/services/services";
import * as tagsApi from "@/services/tags";
import { resolveMediaUrl } from "@/lib/api";
import {
  FULFILLMENT_LABELS,
  FULFILLMENT_MODES,
  FOOD_TAG_NAME,
  isFoodTagName,
  type FulfillmentMode,
} from "@/lib/fulfillment";
import { buildBusinessShortUrl, cn, formatCentsToBRL } from "@/lib/utils";

const MODE_ICONS: Record<FulfillmentMode, typeof DoorOpen> = {
  door: DoorOpen,
  pickup: Package,
  lobby: HandMetal,
  online: Globe,
};

const TABS = [
  { id: "dados", label: "Dados" },
  { id: "atendimento", label: "Atendimento" },
  { id: "itens", label: "Itens" },
  { id: "divulgacao", label: "Divulgação" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function suggestSlug(name: string) {
  const cleaned = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim();
  if (!cleaned) return "";
  return cleaned
    .split(/\s+/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("")
    .slice(0, 48);
}

export default function MyService() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabId>("dados");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [whatsapp, setWhatsapp] = useState(user?.whatsapp ?? "");
  const [instagram, setInstagram] = useState("");
  const [slug, setSlug] = useState("");
  const [fulfillmentModes, setFulfillmentModes] = useState<FulfillmentMode[]>(["door", "pickup", "lobby"]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [newServicePhoto, setNewServicePhoto] = useState<File | null>(null);
  const [newPhotoPreview, setNewPhotoPreview] = useState<string | null>(null);
  const [replacingCover, setReplacingCover] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);

  useEffect(() => {
    if (!newServicePhoto) {
      setNewPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(newServicePhoto);
    setNewPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [newServicePhoto]);

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({ queryKey: ["my-service"], queryFn: servicesApi.getMyService });

  const { data: tagsData } = useQuery({ queryKey: ["tags"], queryFn: tagsApi.listTags });
  const tags = tagsData?.tags ?? [];

  useEffect(() => {
    if (data?.service) {
      setName(data.service.name);
      setDescription(data.service.description ?? "");
      setInstagram(data.service.instagram ?? "");
      setWhatsapp(data.service.whatsapp ?? "");
      setSlug(data.service.slug ?? "");
      setFulfillmentModes(data.service.fulfillmentModes?.length ? data.service.fulfillmentModes : ["door", "pickup", "lobby"]);
      setSelectedTagIds(data.service.tags.map((t) => t.id));
      setSlugTouched(true);
    }
  }, [data?.service]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["my-service"] });
    queryClient.invalidateQueries({ queryKey: ["services"] });
  }

  function toggleMode(mode: FulfillmentMode) {
    setFulfillmentModes((current) => {
      if (current.includes(mode)) {
        if (current.length === 1) return current;
        return current.filter((m) => m !== mode);
      }
      return [...current, mode];
    });
  }

  function toggleTag(tagId: string, tagName: string) {
    setSelectedTagIds((current) => {
      const next = current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId];
      // Sugestão leve: marcar Comida → porta/portaria/retirada; se só online e marcou comida, mantém os modos.
      if (!current.includes(tagId) && isFoodTagName(tagName)) {
        setFulfillmentModes((modes) => {
          const extras: FulfillmentMode[] = ["door", "lobby", "pickup"];
          return [...new Set([...modes.filter((m) => m !== "online" || modes.length > 1), ...extras])];
        });
      }
      return next;
    });
  }

  const createMutation = useMutation({
    mutationFn: () =>
      servicesApi.createService({
        name,
        description,
        whatsapp: whatsapp || undefined,
        instagram: instagram || undefined,
        fulfillmentModes,
        slug: slug || undefined,
        photo: newServicePhoto ?? undefined,
      }),
    onSuccess: async (res) => {
      setError(null);
      setNewServicePhoto(null);
      if (selectedTagIds.length > 0) {
        await servicesApi.assignMyServiceTags(selectedTagIds);
      }
      invalidate();
      return res;
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Erro ao cadastrar negócio."),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      await servicesApi.updateService({
        name,
        description,
        whatsapp: whatsapp || undefined,
        instagram: instagram || undefined,
        fulfillmentModes,
        slug: slug || undefined,
      });
      await servicesApi.assignMyServiceTags(selectedTagIds);
    },
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Erro ao salvar."),
  });

  const deleteMutation = useMutation({
    mutationFn: servicesApi.deleteService,
    onSuccess: () => {
      setTab("dados");
      invalidate();
    },
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
  const shortUrl = service?.slug
    ? buildBusinessShortUrl(window.location.origin, service.slug)
    : slug
      ? buildBusinessShortUrl(window.location.origin, slug)
      : null;
  const previewUrl = slug ? buildBusinessShortUrl(window.location.origin, slug) : shortUrl;

  function validateBusinessFields() {
    if (!name.trim()) {
      setError("Preencha o nome do negócio.");
      setTab("dados");
      return false;
    }
    if (fulfillmentModes.length === 0) {
      setError("Escolha ao menos uma forma de atendimento.");
      setTab("atendimento");
      return false;
    }
    setError(null);
    return true;
  }

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!validateBusinessFields()) return;
    createMutation.mutate();
  }

  function handleUpdate(e: FormEvent) {
    e.preventDefault();
    if (!validateBusinessFields()) return;
    updateMutation.mutate();
  }

  function renderModes() {
    return (
      <div className="space-y-2">
        <Label>Como você atende?</Label>
        <p className="text-xs text-muted-foreground">
          O hub só mostra as opções; combinar horário e pagamento é no WhatsApp.
        </p>
        <div className="space-y-1.5">
          {FULFILLMENT_MODES.map((mode) => {
            const Icon = MODE_ICONS[mode];
            const checked = fulfillmentModes.includes(mode);
            return (
              <label
                key={mode}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm",
                  checked && "border-primary bg-primary/5",
                )}
              >
                <input type="checkbox" checked={checked} onChange={() => toggleMode(mode)} />
                <Icon className="h-4 w-4 text-muted-foreground" />
                {FULFILLMENT_LABELS[mode]}
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  function renderTags() {
    if (tags.length === 0) {
      return (
        <p className="text-xs text-muted-foreground">
          Nenhuma tag cadastrada ainda. Peça ao admin para criar (ex. {FOOD_TAG_NAME}).
        </p>
      );
    }
    return (
      <div className="space-y-2">
        <Label>Tags</Label>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => {
            const active = selectedTagIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id, tag.name)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input text-muted-foreground hover:text-foreground",
                )}
              >
                {tag.name}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderSlugField() {
    return (
      <div className="space-y-1">
        <Label>Link curto</Label>
        <div className="flex items-center gap-1.5">
          <span className="shrink-0 text-xs text-muted-foreground">/n/</span>
          <Input
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.replace(/\s+/g, ""));
            }}
            placeholder="NomeDoMeuNegocio"
            maxLength={48}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Letras, números, _ ou - (3–48). Único no condomínio. Ex.: /n/DocesDaAna
        </p>
      </div>
    );
  }

  function renderSaveActions() {
    if (!service) return null;
    return (
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={updateMutation.isPending}>
          {updateMutation.isPending ? "Salvando..." : "Salvar"}
        </Button>
        {tab === "dados" && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              if (window.confirm("Excluir seu negócio e todos os itens cadastrados?")) {
                deleteMutation.mutate();
              }
            }}
          >
            Excluir negócio
          </Button>
        )}
      </div>
    );
  }

  function renderCreateFooter() {
    if (service) return null;
    return (
      <div className="sticky bottom-16 z-10 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur sm:bottom-0">
        {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={createMutation.isPending}>
          {createMutation.isPending ? "Cadastrando..." : "Cadastrar negócio"}
        </Button>
      </div>
    );
  }

  function renderDadosTab() {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do negócio</CardTitle>
          <CardDescription>
            WhatsApp e Instagram são opcionais — informe pelo menos um pra outros moradores
            conseguirem te encontrar. Se preencher o WhatsApp, ele fica visível pros outros moradores.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Nome do negócio</Label>
            <Input
              value={name}
              onChange={(e) => {
                const next = e.target.value;
                setName(next);
                if (!service && !slugTouched) setSlug(suggestSlug(next));
              }}
              placeholder="Ex: Doces da Maria"
              required
            />
          </div>
          <div className="space-y-1">
            <Label>Descrição{service ? "" : " (opcional)"}</Label>
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
          {renderTags()}
          {service && error && tab === "dados" && <p className="text-sm text-destructive">{error}</p>}
          {renderSaveActions()}
        </CardContent>
      </Card>
    );
  }

  function renderAtendimentoTab() {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Formas de atendimento</CardTitle>
          <CardDescription>
            Escolha como os moradores podem receber ou retirar. O pedido sempre fecha no WhatsApp.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {renderModes()}
          {service && error && tab === "atendimento" && <p className="text-sm text-destructive">{error}</p>}
          {renderSaveActions()}
        </CardContent>
      </Card>
    );
  }

  function renderItensTab() {
    if (!service) {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Itens</CardTitle>
            <CardDescription>Cadastre o negócio primeiro pra poder adicionar itens ao cardápio.</CardDescription>
          </CardHeader>
        </Card>
      );
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Itens ({service.items.length})</CardTitle>
          <CardDescription>Cardápio ou lista do que você oferece. Pedidos fecham no WhatsApp.</CardDescription>
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
    );
  }

  function renderDivulgacaoTab() {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Divulgação</CardTitle>
          <CardDescription>
            Link curto e capa pra compartilhar no WhatsApp. O hub só intermedia — o contato fecha lá.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {renderSlugField()}
          {service?.slug && (
            <p className="text-xs text-muted-foreground">
              Link atual:{" "}
              <a href={shortUrl!} className="text-primary underline-offset-2 hover:underline">
                /n/{service.slug}
              </a>
            </p>
          )}

          <div className="space-y-2">
            <Label>Capa pro compartilhamento (WhatsApp)</Label>
            <p className="text-[11px] text-muted-foreground">
              Essa foto vira a miniatura quando alguém cola o link /n/… no WhatsApp. Prefira algo
              horizontal, com o produto ou a marca bem no centro.
            </p>

            {!service && (
              <>
                {newServicePhoto && newPhotoPreview ? (
                  <div className="space-y-2">
                    <div className="relative aspect-[1.91/1] w-full overflow-hidden rounded-md border">
                      <img src={newPhotoPreview} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setNewServicePhoto(null)}
                        className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                        aria-label="Remover foto"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <ShareCoverPicker
                    pickLabel="+ adicionar capa"
                    onReady={(file) => setNewServicePhoto(file)}
                  />
                )}
                <WhatsAppShareCard
                  title={name || "Seu negócio"}
                  description={description}
                  imagePath={newPhotoPreview}
                  url={previewUrl}
                />
              </>
            )}

            {service && (
              <>
                {!service.imagePath && !replacingCover && (
                  <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
                    Sem capa ainda — ao compartilhar, o preview fica genérico (logo do hub) e quase
                    ninguém clica. Adicione uma foto agora.
                  </p>
                )}
                {service.imagePath && !replacingCover ? (
                  <div className="space-y-2">
                    <div className="relative aspect-[1.91/1] w-full overflow-hidden rounded-md border">
                      <img
                        src={resolveMediaUrl(service.imagePath)}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setReplacingCover(true)}
                      >
                        Trocar / recortar capa
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={removePhotoMutation.isPending}
                        onClick={() => removePhotoMutation.mutate()}
                      >
                        Remover capa
                      </Button>
                    </div>
                  </div>
                ) : (
                  <ShareCoverPicker
                    pickLabel={service.imagePath ? "Escolher nova capa" : "+ adicionar capa"}
                    busy={setPhotoMutation.isPending}
                    onReady={(file) => {
                      setPhotoMutation.mutate(file, {
                        onSuccess: () => setReplacingCover(false),
                      });
                    }}
                    onCancel={() => setReplacingCover(false)}
                  />
                )}
                {photoError && <p className="text-xs text-destructive">{photoError}</p>}
                <WhatsAppShareCard
                  title={name || service.name}
                  description={description || service.description}
                  imagePath={replacingCover ? null : service.imagePath}
                  url={previewUrl}
                />
              </>
            )}
          </div>

          {service && error && tab === "divulgacao" && <p className="text-sm text-destructive">{error}</p>}
          {renderSaveActions()}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-8 pb-28">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Meu negócio</h1>
        <Link to="/negocios" className="shrink-0 text-sm text-primary underline">
          Ver todos
        </Link>
      </div>

      {!service && (
        <p className="text-sm text-muted-foreground">
          Preencha as abas e cadastre. Pedidos e contato continuam no WhatsApp — o hub só
          intermedia.
        </p>
      )}

      <div className="sticky top-0 z-10 -mx-4 border-b bg-background/95 px-4 backdrop-blur">
        <div className="flex gap-1 overflow-x-auto pb-px" role="tablist" aria-label="Seções do negócio">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                tab === t.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {t.id === "itens" && service ? ` (${service.items.length})` : ""}
            </button>
          ))}
        </div>
      </div>

      {tab === "itens" ? (
        <div role="tabpanel">{renderItensTab()}</div>
      ) : (
        <form onSubmit={service ? handleUpdate : handleCreate} className="space-y-4">
          <div role="tabpanel">
            {tab === "dados" && renderDadosTab()}
            {tab === "atendimento" && renderAtendimentoTab()}
            {tab === "divulgacao" && renderDivulgacaoTab()}
          </div>
          {renderCreateFooter()}
        </form>
      )}

      {/* Cadastro: CTA sticky também na aba Itens (ainda sem negócio). */}
      {!service && tab === "itens" && (
        <div className="sticky bottom-16 z-10 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur sm:bottom-0">
          {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
          <Button
            type="button"
            className="w-full"
            disabled={createMutation.isPending}
            onClick={() => {
              if (!validateBusinessFields()) return;
              createMutation.mutate();
            }}
          >
            {createMutation.isPending ? "Cadastrando..." : "Cadastrar negócio"}
          </Button>
        </div>
      )}
    </div>
  );
}
