export const FULFILLMENT_MODES = ["door", "pickup", "lobby", "online"];

export const FULFILLMENT_LABELS = {
  door: "Entrego na sua porta",
  pickup: "Retirada no meu apartamento",
  lobby: "Entrega na portaria",
  online: "Serviço online",
};

const DEFAULT_MODES = ["door", "pickup", "lobby"];

export function parseFulfillmentModes(raw) {
  let list = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
  }
  const cleaned = [...new Set(list.filter((m) => FULFILLMENT_MODES.includes(m)))];
  return cleaned.length > 0 ? cleaned : [...DEFAULT_MODES];
}

export function serializeFulfillmentModes(modes) {
  return JSON.stringify(parseFulfillmentModes(modes));
}
