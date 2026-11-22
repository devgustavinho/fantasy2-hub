export const FULFILLMENT_MODES = ["door", "pickup", "lobby", "online"] as const;

export type FulfillmentMode = (typeof FULFILLMENT_MODES)[number];

export const FULFILLMENT_LABELS: Record<FulfillmentMode, string> = {
  door: "Entrego na sua porta",
  pickup: "Retirada no meu apartamento",
  lobby: "Entrega na portaria",
  online: "Serviço online",
};

export const FULFILLMENT_SHORT: Record<FulfillmentMode, string> = {
  door: "Porta",
  pickup: "Retirada",
  lobby: "Portaria",
  online: "Online",
};

export const FOOD_TAG_NAME = "Comida";

export function isFoodTagName(name: string) {
  return name.localeCompare(FOOD_TAG_NAME, "pt", { sensitivity: "accent" }) === 0;
}

export function formatBuyerApartment(tower: number | null | undefined, code: string | null | undefined) {
  if (tower != null && code) return `Torre ${tower} - ${code}`;
  if (code) return code;
  return null;
}
