import { api } from "@/lib/api";
import type {
  CondoService,
  FulfillmentMode,
  MyService,
  SelectionType,
  ServiceItem,
  ServiceSummary,
  Tag,
} from "@/lib/types";

export type BusinessSegment = "all" | "food" | "services";

export interface ListServicesParams {
  tagIds?: string[];
  modes?: FulfillmentMode[];
  segment?: BusinessSegment;
  q?: string;
}

export const listServices = (params: ListServicesParams | string[] = {}) => {
  const normalized: ListServicesParams = Array.isArray(params) ? { tagIds: params } : params;
  const qs = new URLSearchParams();
  if (normalized.tagIds?.length) qs.set("tags", normalized.tagIds.join(","));
  if (normalized.modes?.length) qs.set("modes", normalized.modes.join(","));
  if (normalized.segment && normalized.segment !== "all") qs.set("segment", normalized.segment);
  if (normalized.q?.trim()) qs.set("q", normalized.q.trim());
  const query = qs.toString();
  return api.get<{ services: ServiceSummary[] }>(`/services${query ? `?${query}` : ""}`);
};

export const getService = (id: string) => api.get<{ service: CondoService }>(`/services/${id}`);

export const resolveServiceSlug = (slug: string) =>
  api.get<{ serviceId: string; slug: string }>(`/services/by-slug/${encodeURIComponent(slug)}`);

export const getMyService = () => api.get<{ service: MyService | null }>("/services/mine");

export interface ServiceSocialInput {
  name: string;
  description?: string;
  whatsapp?: string;
  instagram?: string;
  fulfillmentModes?: FulfillmentMode[];
  slug?: string;
}

// `userId` só é aceito pelo back se quem chama for admin — deixa o admin cadastrar o negócio
// em nome de um morador (ex. alguém sem prática/tempo de mexer no app sozinho).
export const createService = (data: ServiceSocialInput & { photo?: File; userId?: string }) => {
  const form = new FormData();
  form.set("name", data.name);
  if (data.description) form.set("description", data.description);
  if (data.whatsapp) form.set("whatsapp", data.whatsapp);
  if (data.instagram) form.set("instagram", data.instagram);
  if (data.fulfillmentModes?.length) form.set("fulfillmentModes", JSON.stringify(data.fulfillmentModes));
  if (data.slug) form.set("slug", data.slug);
  if (data.photo) form.set("photo", data.photo);
  if (data.userId) form.set("userId", data.userId);
  return api.postForm<{ service: MyService }>("/services", form);
};

export const updateService = (data: ServiceSocialInput) =>
  api.patch<{ service: MyService }>("/services/mine", data);

export const deleteService = () => api.delete<void>("/services/mine");

export const assignMyServiceTags = (tagIds: string[]) =>
  api.put<{ tags: Tag[] }>("/services/mine/tags", { tagIds });

export const assignServiceTags = (serviceId: string, tagIds: string[]) =>
  api.put<{ tags: Tag[] }>(`/services/${serviceId}/tags`, { tagIds });

export const setServicePhoto = (file: File) => {
  const form = new FormData();
  form.set("photo", file);
  return api.postForm<{ imagePath: string }>("/services/mine/photo", form);
};

export const removeServicePhoto = () => api.delete<void>("/services/mine/photo");

export interface ServiceItemInput {
  name: string;
  description?: string;
  price: number;
  isNegotiable?: boolean;
  maxQuantity?: number | null;
  images?: File[];
  removeImageIds?: string[];
}

function toFormData(data: ServiceItemInput) {
  const form = new FormData();
  form.set("name", data.name);
  if (data.description) form.set("description", data.description);
  form.set("price", String(data.price));
  form.set("isNegotiable", String(data.isNegotiable ?? false));
  if (data.maxQuantity) form.set("maxQuantity", String(data.maxQuantity));
  for (const file of data.images ?? []) form.append("images", file);
  for (const id of data.removeImageIds ?? []) form.append("removeImageIds", id);
  return form;
}

export const addServiceItem = (data: ServiceItemInput) =>
  api.postForm<{ itemId: string; items: ServiceItem[] }>("/services/mine/items", toFormData(data));

export const editServiceItem = (itemId: string, data: ServiceItemInput) =>
  api.patchForm<{ items: ServiceItem[] }>(`/services/mine/items/${itemId}`, toFormData(data));

export const deleteServiceItem = (itemId: string) => api.delete<void>(`/services/mine/items/${itemId}`);

export interface OptionInput {
  name: string;
  priceDeltaCents: number;
}

export interface OptionGroupInput {
  name: string;
  selectionType: SelectionType;
  maxSelections?: number | null;
  required?: boolean;
  options: OptionInput[];
}

// Substitui TODOS os grupos/opções do item numa chamada só — o front edita o configurador
// inteiro localmente (sem chamada de rede por grupo/opção) e só sincroniza aqui, no fim.
export const replaceOptionGroups = (itemId: string, groups: OptionGroupInput[]) =>
  api.put<{ item: ServiceItem }>(`/services/mine/items/${itemId}/option-groups`, { groups });
