import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  DoorOpen,
  Globe,
  HandMetal,
  Instagram,
  MessageCircle,
  Minus,
  Package,
  Plus,
  Share2,
  ShoppingCart,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryError } from "@/components/QueryError";
import { useAuth } from "@/contexts/AuthContext";
import * as servicesApi from "@/services/services";
import { resolveMediaUrl } from "@/lib/api";
import {
  FULFILLMENT_LABELS,
  FULFILLMENT_SHORT,
  formatBuyerApartment,
  type FulfillmentMode,
} from "@/lib/fulfillment";
import {
  buildBusinessShareMessage,
  buildBusinessShortUrl,
  buildInstagramLink,
  buildWhatsAppLink,
  buildWhatsAppShareLink,
  cn,
  formatCentsToBRL,
} from "@/lib/utils";
import type { CondoService, ServiceItem } from "@/lib/types";

const MODE_ICONS: Record<FulfillmentMode, typeof DoorOpen> = {
  door: DoorOpen,
  pickup: Package,
  lobby: HandMetal,
  online: Globe,
};

interface ChosenOption {
  optionId: string;
  name: string;
  priceDeltaCents: number;
}

interface ChosenGroup {
  groupId: string;
  groupName: string;
  options: ChosenOption[];
}

interface CartLine {
  key: string;
  itemName: string;
  isNegotiable: boolean;
  quantity: number;
  groups: ChosenGroup[];
  subtotalCents: number | null;
}

function cartStorageKey(serviceId: string) {
  return `fantasy2_negocio_cart_${serviceId}`;
}

function ItemConfigurator({
  item,
  onAdd,
  onClose,
}: {
  item: ServiceItem;
  onAdd: (line: CartLine) => void;
  onClose: () => void;
}) {
  const [activeImage, setActiveImage] = useState(0);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [quantity, setQuantity] = useState(1);
  const canMultiply = !!item.maxQuantity && item.maxQuantity > 1;

  function toggleOption(group: ServiceItem["optionGroups"][number], optionId: string) {
    setSelections((current) => {
      const currentIds = current[group.id] ?? [];
      if (group.selectionType === "single") {
        return { ...current, [group.id]: currentIds.includes(optionId) ? [] : [optionId] };
      }
      if (currentIds.includes(optionId)) {
        return { ...current, [group.id]: currentIds.filter((id) => id !== optionId) };
      }
      if (group.maxSelections && currentIds.length >= group.maxSelections) return current;
      return { ...current, [group.id]: [...currentIds, optionId] };
    });
  }

  const allRequiredMet = item.optionGroups.every((g) => !g.required || (selections[g.id]?.length ?? 0) > 0);

  const deltaCents = item.isNegotiable
    ? 0
    : item.optionGroups.reduce((sum, g) => {
        const ids = selections[g.id] ?? [];
        return sum + g.options.filter((o) => ids.includes(o.id)).reduce((s, o) => s + o.priceDeltaCents, 0);
      }, 0);
  const unitCents = item.priceCents + deltaCents;
  const totalCents = unitCents * quantity;

  function handleAdd() {
    const groups: ChosenGroup[] = item.optionGroups
      .filter((g) => (selections[g.id]?.length ?? 0) > 0)
      .map((g) => ({
        groupId: g.id,
        groupName: g.name,
        options: g.options
          .filter((o) => (selections[g.id] ?? []).includes(o.id))
          .map((o) => ({ optionId: o.id, name: o.name, priceDeltaCents: o.priceDeltaCents })),
      }));

    onAdd({
      key: crypto.randomUUID(),
      itemName: item.name,
      isNegotiable: item.isNegotiable,
      quantity,
      groups,
      subtotalCents: item.isNegotiable ? null : totalCents,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative aspect-square bg-muted/40">
          {item.images.length > 0 ? (
            <img
              src={resolveMediaUrl(item.images[activeImage].path)}
              alt={item.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem foto</div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-2 top-2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
          {item.images.length > 1 && (
            <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
              {item.images.map((img, idx) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setActiveImage(idx)}
                  className={cn("h-2 w-2 rounded-full", idx === activeImage ? "bg-white" : "bg-white/40")}
                  aria-label={`Foto ${idx + 1}`}
                />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4 p-4">
          <div>
            <h2 className="text-lg font-semibold">{item.name}</h2>
            {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
          </div>

          {item.optionGroups.map((group) => (
            <div key={group.id} className="space-y-2">
              <p className="text-sm font-medium">
                {group.name}
                {group.required && <span className="text-destructive"> *</span>}
                {group.selectionType === "multi" && (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    (até {group.maxSelections})
                  </span>
                )}
              </p>
              <div className="space-y-1.5">
                {group.options.map((option) => {
                  const checked = (selections[group.id] ?? []).includes(option.id);
                  return (
                    <label
                      key={option.id}
                      className={cn(
                        "flex cursor-pointer items-center justify-between rounded-md border p-2 text-sm",
                        checked && "border-primary bg-primary/5",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type={group.selectionType === "single" ? "radio" : "checkbox"}
                          name={group.id}
                          checked={checked}
                          onChange={() => toggleOption(group, option.id)}
                        />
                        {option.name}
                      </span>
                      {option.priceDeltaCents !== 0 && (
                        <span className="text-xs text-muted-foreground">
                          {option.priceDeltaCents > 0 ? "+" : ""}
                          {formatCentsToBRL(option.priceDeltaCents)}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}

          {canMultiply && (
            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-sm font-medium">Quantidade</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  className="flex h-7 w-7 items-center justify-center rounded-full border disabled:opacity-40"
                  aria-label="Diminuir"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-4 text-center text-sm">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(item.maxQuantity ?? 1, q + 1))}
                  disabled={quantity >= (item.maxQuantity ?? 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-full border disabled:opacity-40"
                  aria-label="Aumentar"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border-t pt-3">
            <span className="text-sm font-medium">Total</span>
            <span className="text-lg font-semibold">
              {item.isNegotiable ? "A combinar" : formatCentsToBRL(totalCents)}
            </span>
          </div>

          <Button className="w-full" disabled={!allRequiredMet} onClick={handleAdd}>
            Adicionar ao pedido
          </Button>
        </div>
      </div>
    </div>
  );
}

function buildCheckoutMessage(
  service: CondoService,
  cart: CartLine[],
  fulfillmentMode: FulfillmentMode,
  buyerApt: string | null,
) {
  const lines: string[] = [`Olá! Gostaria de fazer um pedido em "${service.name}":`, ""];
  let totalCents = 0;
  let hasNegotiable = false;

  for (const line of cart) {
    lines.push(`${line.quantity}x ${line.itemName}`);
    for (const group of line.groups) {
      lines.push(`  - ${group.groupName}: ${group.options.map((o) => o.name).join(", ")}`);
    }
    if (line.subtotalCents === null) {
      hasNegotiable = true;
      lines.push(`  Subtotal: a combinar`);
    } else {
      totalCents += line.subtotalCents;
      lines.push(`  Subtotal: ${formatCentsToBRL(line.subtotalCents)}`);
    }
    lines.push("");
  }

  lines.push(`Total: ${formatCentsToBRL(totalCents)}${hasNegotiable ? " + itens a combinar" : ""}`);
  lines.push("");
  if (buyerApt) lines.push(`Apartamento do pedido: ${buyerApt}`);
  lines.push(`Forma: ${FULFILLMENT_LABELS[fulfillmentMode]}`);
  if (fulfillmentMode === "online") {
    lines.push("Combinar link/horário no chat.");
  }
  return lines.join("\n");
}

export default function ServiceDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [configuring, setConfiguring] = useState<ServiceItem | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [fulfillmentMode, setFulfillmentMode] = useState<FulfillmentMode | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["service", id],
    queryFn: () => servicesApi.getService(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (!id) return;
    try {
      const raw = sessionStorage.getItem(cartStorageKey(id));
      if (raw) setCart(JSON.parse(raw) as CartLine[]);
    } catch {
      // ignore
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    try {
      if (cart.length === 0) sessionStorage.removeItem(cartStorageKey(id));
      else sessionStorage.setItem(cartStorageKey(id), JSON.stringify(cart));
    } catch {
      // ignore
    }
  }, [cart, id]);

  useEffect(() => {
    const modes = data?.service.fulfillmentModes ?? [];
    if (modes.length === 1) setFulfillmentMode(modes[0]);
    else if (fulfillmentMode && !modes.includes(fulfillmentMode)) setFulfillmentMode(null);
  }, [data?.service.fulfillmentModes, fulfillmentMode]);

  const buyerApt = useMemo(
    () => formatBuyerApartment(user?.tower, user?.apartmentCode),
    [user?.tower, user?.apartmentCode],
  );

  if (isLoading) {
    return <p className="mx-auto max-w-4xl px-4 py-8 text-muted-foreground">Carregando...</p>;
  }
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <QueryError onRetry={() => refetch()} />
      </div>
    );
  }

  const service = data.service;
  const modes = service.fulfillmentModes;
  const canCheckout = cart.length > 0 && !!fulfillmentMode;
  const whatsappLink =
    canCheckout && service.owner.whatsapp
      ? buildWhatsAppLink(
          service.owner.whatsapp,
          buildCheckoutMessage(service, cart, fulfillmentMode!, buyerApt),
        )
      : null;
  const grandTotalCents = cart.reduce((sum, l) => sum + (l.subtotalCents ?? 0), 0);
  const hasNegotiableInCart = cart.some((l) => l.subtotalCents === null);
  const shareUrl = service.slug
    ? buildBusinessShortUrl(window.location.origin, service.slug)
    : `${window.location.origin}/negocios/${service.id}`;
  const shareWa = buildWhatsAppShareLink(buildBusinessShareMessage(service.name, shareUrl));

  async function handleShare() {
    try {
      if (navigator.share) {
        await navigator.share({ title: service.name, text: `Olha esse negócio no hub: ${service.name}`, url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      window.open(shareWa, "_blank", "noreferrer");
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 pb-28">
      <div className="flex items-center justify-between gap-2">
        <Link
          to="/negocios"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
        <Button type="button" variant="outline" size="sm" onClick={handleShare}>
          <Share2 className="mr-1.5 h-3.5 w-3.5" />
          {shareCopied ? "Link copiado" : "Compartilhar"}
        </Button>
      </div>

      {service.imagePath && (
        <div className="aspect-video w-full overflow-hidden rounded-lg bg-muted/40">
          <img src={resolveMediaUrl(service.imagePath)} alt={service.name} className="h-full w-full object-cover" />
        </div>
      )}

      <div>
        <h1 className="text-2xl font-semibold">{service.name}</h1>
        <p className="text-sm text-muted-foreground">
          {service.owner.name}
          {service.owner.tower && service.owner.apartmentCode
            ? ` · Torre ${service.owner.tower} - ${service.owner.apartmentCode}`
            : ""}
        </p>
        {service.description && (
          <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{service.description}</p>
        )}
        {service.instagram && (
          <a
            href={buildInstagramLink(service.instagram)}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
          >
            <Instagram className="h-3.5 w-3.5" />@{service.instagram}
          </a>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {modes.map((mode) => {
            const Icon = MODE_ICONS[mode];
            return (
              <span
                key={mode}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                <Icon className="h-3 w-3" />
                {FULFILLMENT_SHORT[mode]}
              </span>
            );
          })}
        </div>
        {service.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {service.tags.map((tag) => (
              <span key={tag.id} className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {service.items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setConfiguring(item)}
            className="group flex flex-col overflow-hidden rounded-md border text-left transition-colors hover:border-primary/50"
          >
            <div className="flex aspect-square items-center justify-center bg-muted/40">
              {item.images.length > 0 ? (
                <img
                  src={resolveMediaUrl(item.images[0].path)}
                  alt={item.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-xs text-muted-foreground">Sem foto</span>
              )}
            </div>
            <div className="space-y-0.5 p-2">
              <p className="truncate text-sm font-medium group-hover:text-primary">{item.name}</p>
              <p className="text-xs text-muted-foreground">
                {item.isNegotiable ? "A combinar" : formatCentsToBRL(item.priceCents)}
              </p>
            </div>
          </button>
        ))}
        {service.items.length === 0 && (
          <p className="col-span-full text-sm text-muted-foreground">Nenhum item cadastrado ainda.</p>
        )}
      </div>

      {cart.length > 0 && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="h-4 w-4" /> Seu pedido
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {cart.map((line) => (
              <div key={line.key} className="flex items-start justify-between gap-2 rounded-md border p-2 text-sm">
                <div>
                  <p className="font-medium">
                    {line.quantity > 1 ? `${line.quantity}x ` : ""}
                    {line.itemName}
                  </p>
                  {line.groups.map((g) => (
                    <p key={g.groupId} className="text-xs text-muted-foreground">
                      {g.groupName}: {g.options.map((o) => o.name).join(", ")}
                    </p>
                  ))}
                  <p className="text-xs text-muted-foreground">
                    {line.subtotalCents === null ? "A combinar" : formatCentsToBRL(line.subtotalCents)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCart((c) => c.filter((l) => l.key !== line.key))}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Remover"
                >
                  <Minus className="h-4 w-4" />
                </button>
              </div>
            ))}

            <div className="space-y-2 border-t pt-3">
              <p className="text-sm font-medium">Como quer receber?</p>
              <div className="space-y-1.5">
                {modes.map((mode) => {
                  const Icon = MODE_ICONS[mode];
                  return (
                    <label
                      key={mode}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm",
                        fulfillmentMode === mode && "border-primary bg-primary/5",
                      )}
                    >
                      <input
                        type="radio"
                        name="fulfillment"
                        checked={fulfillmentMode === mode}
                        onChange={() => setFulfillmentMode(mode)}
                      />
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      {FULFILLMENT_LABELS[mode]}
                    </label>
                  );
                })}
              </div>
              {buyerApt && (
                <p className="text-xs text-muted-foreground">Apartamento do pedido: {buyerApt}</p>
              )}
            </div>

            <div className="flex items-center justify-between border-t pt-2 font-medium">
              <span>Total</span>
              <span>
                {formatCentsToBRL(grandTotalCents)}
                {hasNegotiableInCart ? " + itens a combinar" : ""}
              </span>
            </div>
            {whatsappLink ? (
              <Button asChild className="w-full">
                <a href={whatsappLink} target="_blank" rel="noreferrer">
                  <MessageCircle className="mr-2 h-4 w-4" /> Pedir no WhatsApp
                </a>
              </Button>
            ) : !service.owner.whatsapp ? (
              <p className="text-center text-sm text-muted-foreground">
                Este negócio não tem WhatsApp cadastrado para pedidos.
              </p>
            ) : (
              <p className="text-center text-sm text-muted-foreground">
                Escolha como quer receber antes de pedir.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {configuring && (
        <ItemConfigurator
          item={configuring}
          onClose={() => setConfiguring(null)}
          onAdd={(line) => {
            setCart((c) => [...c, line]);
            setConfiguring(null);
          }}
        />
      )}
    </div>
  );
}
