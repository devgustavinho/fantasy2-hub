import { api } from "@/lib/api";
import type { CondoService, MyService, ServiceItem, Tag } from "@/lib/types";

export const listServices = (tagIds: string[] = []) => {
  const qs = tagIds.length > 0 ? `?tags=${tagIds.join(",")}` : "";
  return api.get<{ services: CondoService[] }>(`/services${qs}`);
};

export const getMyService = () => api.get<{ service: MyService | null }>("/services/mine");

export const createService = (data: { name: string; description?: string; whatsapp: string }) =>
  api.post<{ service: MyService }>("/services", data);

export const updateService = (data: { name: string; description?: string }) =>
  api.patch<{ service: MyService }>("/services/mine", data);

export const deleteService = () => api.delete<void>("/services/mine");

export const assignServiceTags = (serviceId: string, tagIds: string[]) =>
  api.put<{ tags: Tag[] }>(`/services/${serviceId}/tags`, { tagIds });

export interface ServiceItemInput {
  name: string;
  description?: string;
  price: number;
  images?: File[];
  removeImageIds?: string[];
}

function toFormData(data: ServiceItemInput) {
  const form = new FormData();
  form.set("name", data.name);
  if (data.description) form.set("description", data.description);
  form.set("price", String(data.price));
  for (const file of data.images ?? []) form.append("images", file);
  for (const id of data.removeImageIds ?? []) form.append("removeImageIds", id);
  return form;
}

export const addServiceItem = (data: ServiceItemInput) =>
  api.postForm<{ items: ServiceItem[] }>("/services/mine/items", toFormData(data));

export const editServiceItem = (itemId: string, data: ServiceItemInput) =>
  api.patchForm<{ items: ServiceItem[] }>(`/services/mine/items/${itemId}`, toFormData(data));

export const deleteServiceItem = (itemId: string) => api.delete<void>(`/services/mine/items/${itemId}`);
