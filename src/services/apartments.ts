import { api } from "@/lib/api";
import type { Apartment, ApartmentMapEntry } from "@/lib/types";

export const listApartmentsByTower = (tower: number) =>
  api.get<{ apartments: Apartment[] }>(`/apartments?tower=${tower}`);

export const getApartmentMap = (tower: number) =>
  api.get<{ apartments: ApartmentMapEntry[] }>(`/apartments/map?tower=${tower}`);
