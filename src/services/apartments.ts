import { api } from "@/lib/api";
import type { Apartment } from "@/lib/types";

export const listApartmentsByTower = (tower: number) =>
  api.get<{ apartments: Apartment[] }>(`/apartments?tower=${tower}`);
