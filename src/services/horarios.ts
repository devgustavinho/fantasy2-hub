import { api } from "@/lib/api";

export type CommonArea = {
  id: string;
  name: string;
  sortOrder: number;
  is24h: boolean;
  opensAt: string | null;
  closesAt: string | null;
  assemblyRef: string | null;
  notes: string | null;
  updatedAt: string | null;
};

export type MudancaWindow = {
  days: number[];
  opensAt: string;
  closesAt: string;
};

export type BlockedDay = {
  id: string;
  date: string;
  reason: string;
  source: "national" | "fortaleza" | "custom";
  createdAt?: string;
};

export type HorariosBundle = {
  timezone: string;
  areas: CommonArea[];
  mudanca: {
    windows: MudancaWindow[];
    assemblyRef: string | null;
    updatedAt: string | null;
    blockedDays: BlockedDay[];
  };
  convivencia: {
    noiseUntil: string;
    assemblyRef: string | null;
    updatedAt: string | null;
  };
};

export type HorariosStatus = {
  timezone: string;
  now: { date: string; time: string; day: number };
  mudancaNow: {
    allowed: boolean;
    reason: string;
    window: MudancaWindow | null;
    blocked: { date: string; reason: string; source: string } | null;
  };
  mudancaTomorrow: {
    date: string;
    allowed: boolean;
    reason: string;
    window: MudancaWindow | null;
    blocked: { date: string; reason: string; source: string } | null;
  };
  noiseNow: {
    allowed: boolean;
    noiseUntil: string;
    reason: string;
  };
};

export const getHorarios = () => api.get<HorariosBundle>("/horarios");

export const getHorariosStatus = () => api.get<HorariosStatus>("/horarios/status");

export const updateArea = (
  id: string,
  data: {
    is24h: boolean;
    opensAt?: string | null;
    closesAt?: string | null;
    assemblyRef?: string | null;
    notes?: string | null;
  },
) => api.patch<{ area: CommonArea }>(`/horarios/areas/${id}`, data);

export const updateMudanca = (data: { windows: MudancaWindow[]; assemblyRef?: string | null }) =>
  api.put<{ mudanca: HorariosBundle["mudanca"] }>("/horarios/mudanca", data);

export const addBlockedDay = (data: { date: string; reason: string; source?: BlockedDay["source"] }) =>
  api.post<{ day: BlockedDay }>("/horarios/mudanca/blocked", data);

export const deleteBlockedDay = (id: string) =>
  api.delete<{ ok: true }>(`/horarios/mudanca/blocked/${id}`);

export const updateConvivencia = (data: { noiseUntil: string; assemblyRef?: string | null }) =>
  api.put<{ convivencia: HorariosBundle["convivencia"] }>("/horarios/convivencia", data);
