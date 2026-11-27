import { api } from "@/lib/api";
import type { Apartment, ApartmentMapEntry, TowerPortalCoverage } from "@/lib/types";

export const listApartmentsByTower = (tower: number) =>
  api.get<{ apartments: Apartment[] }>(`/apartments?tower=${tower}`);

export const getApartmentMap = (tower: number) =>
  api.get<{
    apartments: ApartmentMapEntry[];
    coverage: TowerPortalCoverage;
    towersCoverage: TowerPortalCoverage[];
  }>(`/apartments/map?tower=${tower}`);
