import { Router } from "express";
import QRCode from "qrcode";
import { z } from "zod";
import { requireAuth, requireApproved, requireStaff } from "../../auth/guards.js";
import { recordAudit } from "../audit/service.js";
import { ingestHorarios, scheduleIngest } from "../rag/ingest.js";
import {
  addBlockedDay,
  getAreaWifiPayload,
  getHorariosBundle,
  getHorariosStatus,
  patchCommonArea,
  putConvivenciaSettings,
  putMudancaSettings,
  removeBlockedDay,
} from "./service.js";

function scheduleHorariosIngest() {
  scheduleIngest("horarios", () => ingestHorarios());
}

const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const areaSchema = z.object({
  is24h: z.boolean(),
  opensAt: z.string().nullable().optional(),
  closesAt: z.string().nullable().optional(),
  assemblyRef: z.string().trim().max(200).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  wifiSsid: z.string().trim().max(64).nullable().optional(),
  wifiPassword: z.string().max(128).nullable().optional(),
  wifiSecurity: z.enum(["WPA", "WEP", "nopass"]).optional(),
});

const mudancaSchema = z.object({
  windows: z
    .array(
      z.object({
        days: z.array(z.number().int().min(0).max(6)).min(1),
        opensAt: hm,
        closesAt: hm,
      }),
    )
    .min(1),
  assemblyRef: z.string().trim().max(200).nullable().optional(),
});

const blockedSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().min(2).max(200),
  source: z.enum(["national", "fortaleza", "custom"]).optional(),
});

const convivenciaSchema = z.object({
  noiseUntil: hm,
  assemblyRef: z.string().trim().max(200).nullable().optional(),
});

export function horariosRoutes() {
  const router = Router();
  router.use(requireAuth, requireApproved);

  router.get("/", (_req, res) => {
    res.json(getHorariosBundle());
  });

  router.get("/status", (_req, res) => {
    res.json(getHorariosStatus());
  });

  // Credenciais + QR (data URL) pra conectar no Wi‑Fi da área.
  router.get("/areas/:id/wifi", async (req, res) => {
    try {
      const wifi = getAreaWifiPayload(req.params.id);
      const qrDataUrl = await QRCode.toDataURL(wifi.wifiUri, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 280,
      });
      res.json({ ...wifi, qrDataUrl });
    } catch (err) {
      res.status(err.status || 500).json({ message: err.message || "Falha ao carregar Wi‑Fi." });
    }
  });

  router.patch("/areas/:id", requireStaff, (req, res) => {
    const parsed = areaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Dados da área inválidos." });
    }
    try {
      const area = patchCommonArea(req.params.id, parsed.data, req.user.id);
      recordAudit({
        actorUserId: req.user.id,
        actorName: req.user.name,
        action: "horarios.area_update",
        entityType: "common_area",
        entityId: req.params.id,
        details: {
          is24h: parsed.data.is24h,
          opensAt: parsed.data.opensAt,
          closesAt: parsed.data.closesAt,
          assemblyRef: parsed.data.assemblyRef,
          // Nunca gravar senha no audit — só se Wi‑Fi foi tocado / tem SSID.
          wifiUpdated: "wifiSsid" in parsed.data || "wifiPassword" in parsed.data,
          hasWifi: Boolean(area.hasWifi),
          wifiSsid: area.wifiSsid,
        },
      });
      scheduleHorariosIngest();
      res.json({ area });
    } catch (err) {
      res.status(err.status || 500).json({ message: err.message || "Falha ao salvar." });
    }
  });

  router.put("/mudanca", requireStaff, (req, res) => {
    const parsed = mudancaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Informe ao menos uma janela válida de mudança." });
    }
    try {
      const mudanca = putMudancaSettings(parsed.data, req.user.id);
      recordAudit({
        actorUserId: req.user.id,
        actorName: req.user.name,
        action: "horarios.mudanca_update",
        entityType: "mudanca_settings",
        entityId: "1",
        details: { windows: parsed.data.windows.length, assemblyRef: parsed.data.assemblyRef },
      });
      scheduleHorariosIngest();
      res.json({ mudanca });
    } catch (err) {
      res.status(err.status || 500).json({ message: err.message || "Falha ao salvar." });
    }
  });

  router.post("/mudanca/blocked", requireStaff, (req, res) => {
    const parsed = blockedSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Informe data (YYYY-MM-DD) e motivo." });
    }
    try {
      const day = addBlockedDay(parsed.data, req.user.id);
      recordAudit({
        actorUserId: req.user.id,
        actorName: req.user.name,
        action: "horarios.blocked_add",
        entityType: "mudanca_blocked_day",
        entityId: day.id,
        details: { date: day.date, reason: day.reason, source: day.source },
      });
      scheduleHorariosIngest();
      res.status(201).json({ day });
    } catch (err) {
      res.status(err.status || 500).json({ message: err.message || "Falha ao bloquear." });
    }
  });

  router.delete("/mudanca/blocked/:id", requireStaff, (req, res) => {
    try {
      removeBlockedDay(req.params.id);
      recordAudit({
        actorUserId: req.user.id,
        actorName: req.user.name,
        action: "horarios.blocked_delete",
        entityType: "mudanca_blocked_day",
        entityId: req.params.id,
      });
      scheduleHorariosIngest();
      res.json({ ok: true });
    } catch (err) {
      res.status(err.status || 500).json({ message: err.message || "Falha ao remover." });
    }
  });

  router.put("/convivencia", requireStaff, (req, res) => {
    const parsed = convivenciaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Informe o horário de silêncio (HH:MM)." });
    }
    try {
      const convivencia = putConvivenciaSettings(parsed.data, req.user.id);
      recordAudit({
        actorUserId: req.user.id,
        actorName: req.user.name,
        action: "horarios.convivencia_update",
        entityType: "convivencia_settings",
        entityId: "1",
        details: { noiseUntil: parsed.data.noiseUntil, assemblyRef: parsed.data.assemblyRef },
      });
      scheduleHorariosIngest();
      res.json({ convivencia });
    } catch (err) {
      res.status(err.status || 500).json({ message: err.message || "Falha ao salvar." });
    }
  });

  return router;
}
