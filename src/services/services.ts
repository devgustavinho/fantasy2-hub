import { api } from "@/lib/api";
import type { CondoService, MyService, SelectionType, ServiceItem, ServiceSummary, Tag } from "@/lib/types";

export const listServices = (tagIds: string[] = []) => {
  const qs = tagIds.length > 0 ? `?tags=${tagIds.join(",")}` : "";
  return api.get<{ services: ServiceSummary[] }>(`/services${qs}`);
};

export const getService = (id: string) => api.get<{ service: CondoService }>(`/services/${id}`);

export const getMyService = () => api.get<{ service: MyService | null }>("/services/mine");

export interface ServiceSocialInput {
  name: string;
  description?: string;
  whatsapp?: string;
  instagram?: string;
}

export const createService = (data: ServiceSocialInput) => api.post<{ service: MyService }>("/services", data);

export const updateService = (data: ServiceSocialInput) =>
  api.patch<{ service: MyService }>("/services/mine", data);

export const deleteService = () => api.delete<void>("/services/mine");

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
  api.postForm<{ items: ServiceItem[] }>("/services/mine/items", toFormData(data));

export const editServiceItem = (itemId: string, data: ServiceItemInput) =>
  api.patchForm<{ items: ServiceItem[] }>(`/services/mine/items/${itemId}`, toFormData(data));

export const deleteServiceItem = (itemId: string) => api.delete<void>(`/services/mine/items/${itemId}`);

export interface OptionGroupInput {
  name: string;
  selectionType: SelectionType;
  maxSelections?: number | null;
  required?: boolean;
}

export const addOptionGroup = (itemId: string, data: OptionGroupInput) =>
  api.post<{ item: ServiceItem }>(`/services/mine/items/${itemId}/groups`, data);

export const editOptionGroup = (itemId: string, groupId: string, data: OptionGroupInput) =>
  api.patch<{ item: ServiceItem }>(`/services/mine/items/${itemId}/groups/${groupId}`, data);

export const deleteOptionGroup = (itemId: string, groupId: string) =>
  api.delete<{ item: ServiceItem }>(`/services/mine/items/${itemId}/groups/${groupId}`);

export interface OptionInput {
  name: string;
  priceDeltaCents?: number;
}

export const addOption = (itemId: string, groupId: string, data: OptionInput) =>
  api.post<{ item: ServiceItem }>(`/services/mine/items/${itemId}/groups/${groupId}/options`, data);

export const editOption = (itemId: string, groupId: string, optionId: string, data: OptionInput) =>
  api.patch<{ item: ServiceItem }>(`/services/mine/items/${itemId}/groups/${groupId}/options/${optionId}`, data);

export const deleteOption = (itemId: string, groupId: string, optionId: string) =>
  api.delete<{ item: ServiceItem }>(`/services/mine/items/${itemId}/groups/${groupId}/options/${optionId}`);
