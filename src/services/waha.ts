import { api } from "@/lib/api";

export type WahaHealth = {
  ok: boolean;
  enabled: boolean;
  configured: boolean;
  session: string | null;
  groupConfigured: boolean;
  botPhoneConfigured?: boolean;
  botLidConfigured?: boolean;
  summaryAllowlistConfigured: boolean;
};

export const getWahaHealth = () => api.get<WahaHealth>("/waha/health");
