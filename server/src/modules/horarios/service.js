import { randomUUID } from "node:crypto";
import { sqlite } from "../../db/client.js";
import { ensureHolidaySeed } from "./holidays.js";
import { addDays, fortalezaParts, inTimeRange, isHm } from "./time.js";
import { buildWifiUri, normalizeWifiSecurity, WIFI_SECURITIES } from "./wifi.js";

const listAreas = sqlite.prepare(`
  SELECT id, name, sort_order AS sortOrder, is_24h AS is24h,
         opens_at AS opensAt, closes_at AS closesAt,
         assembly_ref AS assemblyRef, notes,
         wifi_ssid AS wifiSsid, wifi_password AS wifiPassword,
         wifi_security AS wifiSecurity,
         updated_at AS updatedAt, updated_by AS updatedBy
  FROM common_areas
  ORDER BY sort_order ASC
`);

const getArea = sqlite.prepare("SELECT * FROM common_areas WHERE id = ?");

const updateArea = sqlite.prepare(`
  UPDATE common_areas
  SET is_24h = @is_24h, opens_at = @opens_at, closes_at = @closes_at,
      assembly_ref = @assembly_ref, notes = @notes,
      wifi_ssid = @wifi_ssid, wifi_password = @wifi_password,
      wifi_security = @wifi_security,
      updated_at = @updated_at, updated_by = @updated_by
  WHERE id = @id
`);

const getMudanca = sqlite.prepare(`
  SELECT windows_json AS windowsJson, assembly_ref AS assemblyRef,
         updated_at AS updatedAt, updated_by AS updatedBy
  FROM mudanca_settings WHERE id = 1
`);

const updateMudanca = sqlite.prepare(`
  UPDATE mudanca_settings
  SET windows_json = @windows_json, assembly_ref = @assembly_ref,
      updated_at = @updated_at, updated_by = @updated_by
  WHERE id = 1
`);

const listBlocked = sqlite.prepare(`
  SELECT id, day_date AS date, reason, source, created_at AS createdAt
  FROM mudanca_blocked_days
  WHERE day_date >= ?
  ORDER BY day_date ASC
`);

const getBlockedOn = sqlite.prepare(`
  SELECT id, day_date AS date, reason, source FROM mudanca_blocked_days WHERE day_date = ?
`);

const insertBlocked = sqlite.prepare(`
  INSERT INTO mudanca_blocked_days (id, day_date, reason, source, created_by)
  VALUES (@id, @day_date, @reason, @source, @created_by)
`);

const deleteBlocked = sqlite.prepare("DELETE FROM mudanca_blocked_days WHERE id = ?");

const getConvivencia = sqlite.prepare(`
  SELECT noise_until AS noiseUntil, assembly_ref AS assemblyRef,
         updated_at AS updatedAt, updated_by AS updatedBy
  FROM convivencia_settings WHERE id = 1
`);

const updateConvivencia = sqlite.prepare(`
  UPDATE convivencia_settings
  SET noise_until = @noise_until, assembly_ref = @assembly_ref,
      updated_at = @updated_at, updated_by = @updated_by
  WHERE id = 1
`);

function parseWindows(json) {
  try {
    const raw = JSON.parse(json || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.map((w) => ({
      days: Array.isArray(w.days) ? w.days.map(Number) : [],
      opensAt: String(w.opensAt || ""),
      closesAt: String(w.closesAt || ""),
    }));
  } catch {
    return [];
  }
}

function serializeArea(row) {
  const wifiSsid = row.wifiSsid ?? row.wifi_ssid ?? null;
  const wifiPassword = row.wifiPassword ?? row.wifi_password ?? null;
  const wifiSecurity = row.wifiSecurity ?? row.wifi_security ?? "WPA";
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    is24h: Boolean(row.is24h ?? row.is_24h),
    opensAt: row.opensAt ?? row.opens_at ?? null,
    closesAt: row.closesAt ?? row.closes_at ?? null,
    assemblyRef: row.assemblyRef ?? row.assembly_ref ?? null,
    notes: row.notes ?? null,
    wifiSsid: wifiSsid || null,
    wifiPassword: wifiSsid ? wifiPassword ?? "" : null,
    wifiSecurity: wifiSsid ? wifiSecurity : null,
    hasWifi: Boolean(wifiSsid),
    updatedAt: row.updatedAt ?? row.updated_at ?? null,
  };
}

export function getHorariosBundle() {
  ensureHolidaySeed(5);
  const mudanca = getMudanca.get();
  const convivencia = getConvivencia.get();
  const today = fortalezaParts().date;
  return {
    timezone: "America/Fortaleza",
    areas: listAreas.all().map(serializeArea),
    mudanca: {
      windows: parseWindows(mudanca.windowsJson),
      assemblyRef: mudanca.assemblyRef,
      updatedAt: mudanca.updatedAt,
      blockedDays: listBlocked.all(today),
    },
    convivencia: {
      noiseUntil: convivencia.noiseUntil,
      assemblyRef: convivencia.assemblyRef,
      updatedAt: convivencia.updatedAt,
    },
  };
}

function mudancaAllowedOn(dateIso, dayOfWeek, timeHm, windows) {
  const blocked = getBlockedOn.get(dateIso);
  if (blocked) {
    return {
      allowed: false,
      reason: `Dia bloqueado: ${blocked.reason}`,
      blocked: { date: blocked.date, reason: blocked.reason, source: blocked.source },
      window: null,
    };
  }
  const window = windows.find((w) => w.days.includes(dayOfWeek));
  if (!window) {
    return { allowed: false, reason: "Sem janela de mudança neste dia da semana.", blocked: null, window: null };
  }
  if (timeHm != null && !inTimeRange(timeHm, window.opensAt, window.closesAt)) {
    return {
      allowed: false,
      reason: `Fora da janela (${window.opensAt}–${window.closesAt}).`,
      blocked: null,
      window,
    };
  }
  return {
    allowed: true,
    reason: timeHm == null
      ? `Permitido (${window.opensAt}–${window.closesAt}).`
      : `Dentro da janela (${window.opensAt}–${window.closesAt}).`,
    blocked: null,
    window,
  };
}

export function getHorariosStatus(now = new Date()) {
  ensureHolidaySeed(5);
  const parts = fortalezaParts(now);
  const tomorrowDate = addDays(parts.date, 1);
  // weekday de amanhã a partir da data (sem DST em Fortaleza)
  const [ty, tm, td] = tomorrowDate.split("-").map(Number);
  const tomorrowUtcNoon = new Date(Date.UTC(ty, tm - 1, td, 15, 0, 0)); // ~12h Fortaleza
  const tomorrowParts = fortalezaParts(tomorrowUtcNoon);

  const windows = parseWindows(getMudanca.get().windowsJson);
  const noiseUntil = getConvivencia.get().noiseUntil;

  const mudancaNow = mudancaAllowedOn(parts.date, parts.day, parts.time, windows);
  const mudancaTomorrow = mudancaAllowedOn(tomorrowDate, tomorrowParts.day, null, windows);

  // Barulho permitido das 00:00 até noiseUntil (a partir de noiseUntil = silêncio).
  const canMakeNoise = parts.time < noiseUntil;

  return {
    timezone: "America/Fortaleza",
    now: { date: parts.date, time: parts.time, day: parts.day },
    mudancaNow: {
      allowed: mudancaNow.allowed,
      reason: mudancaNow.reason,
      window: mudancaNow.window,
      blocked: mudancaNow.blocked,
    },
    mudancaTomorrow: {
      date: tomorrowDate,
      allowed: mudancaTomorrow.allowed,
      reason: mudancaTomorrow.reason,
      window: mudancaTomorrow.window,
      blocked: mudancaTomorrow.blocked,
    },
    noiseNow: {
      allowed: canMakeNoise,
      noiseUntil,
      reason: canMakeNoise
        ? `Barulho permitido até ${noiseUntil}.`
        : `Horário de silêncio (após ${noiseUntil}).`,
    },
  };
}

export function patchCommonArea(id, input, actorUserId) {
  const row = getArea.get(id);
  if (!row) {
    const err = new Error("Área não encontrada.");
    err.status = 404;
    throw err;
  }

  const is24h = Boolean(input.is24h);
  let opensAt = input.opensAt ?? null;
  let closesAt = input.closesAt ?? null;
  if (is24h) {
    opensAt = null;
    closesAt = null;
  } else {
    if (!isHm(opensAt) || !isHm(closesAt)) {
      const err = new Error("Informe abertura e fechamento no formato HH:MM.");
      err.status = 400;
      throw err;
    }
  }

  // Wi‑Fi: omitir no body = manter; string vazia no SSID = limpar; senha só muda se enviada.
  let wifiSsid = row.wifi_ssid;
  let wifiPassword = row.wifi_password;
  let wifiSecurity = row.wifi_security || "WPA";
  if ("wifiSsid" in input) {
    const nextSsid = input.wifiSsid == null ? "" : String(input.wifiSsid).trim();
    if (!nextSsid) {
      wifiSsid = null;
      wifiPassword = null;
      wifiSecurity = "WPA";
    } else {
      wifiSsid = nextSsid.slice(0, 64);
      if ("wifiPassword" in input) {
        wifiPassword = input.wifiPassword == null ? "" : String(input.wifiPassword).slice(0, 128);
      } else if (wifiPassword == null) {
        wifiPassword = "";
      }
      if ("wifiSecurity" in input && WIFI_SECURITIES.has(input.wifiSecurity)) {
        wifiSecurity = input.wifiSecurity;
      }
      if (wifiSecurity === "nopass") wifiPassword = "";
    }
  } else if ("wifiPassword" in input || "wifiSecurity" in input) {
    if (!wifiSsid) {
      const err = new Error("Cadastre o nome da rede (SSID) antes da senha.");
      err.status = 400;
      throw err;
    }
    if ("wifiPassword" in input) {
      wifiPassword = input.wifiPassword == null ? "" : String(input.wifiPassword).slice(0, 128);
    }
    if ("wifiSecurity" in input && WIFI_SECURITIES.has(input.wifiSecurity)) {
      wifiSecurity = input.wifiSecurity;
    }
    if (wifiSecurity === "nopass") wifiPassword = "";
  }

  updateArea.run({
    id,
    is_24h: is24h ? 1 : 0,
    opens_at: opensAt,
    closes_at: closesAt,
    assembly_ref: input.assemblyRef?.trim() || null,
    notes: input.notes?.trim() || null,
    wifi_ssid: wifiSsid,
    wifi_password: wifiPassword,
    wifi_security: wifiSecurity,
    updated_at: new Date().toISOString(),
    updated_by: actorUserId,
  });

  return serializeArea({ ...listAreas.all().find((a) => a.id === id) });
}

export function getAreaWifiPayload(id) {
  const row = getArea.get(id);
  if (!row) {
    const err = new Error("Área não encontrada.");
    err.status = 404;
    throw err;
  }
  if (!row.wifi_ssid) {
    const err = new Error("Esta área não tem Wi‑Fi cadastrado.");
    err.status = 404;
    throw err;
  }
  const security = normalizeWifiSecurity(row.wifi_security);
  const wifiUri = buildWifiUri({
    ssid: row.wifi_ssid,
    password: row.wifi_password || "",
    security,
  });
  return {
    areaId: row.id,
    areaName: row.name,
    ssid: row.wifi_ssid,
    password: security === "nopass" ? "" : row.wifi_password || "",
    security,
    wifiUri,
  };
}

export function putMudancaSettings(input, actorUserId) {
  const windows = Array.isArray(input.windows) ? input.windows : [];
  for (const w of windows) {
    if (!Array.isArray(w.days) || w.days.length === 0) {
      const err = new Error("Cada janela precisa de pelo menos um dia da semana.");
      err.status = 400;
      throw err;
    }
    if (!isHm(w.opensAt) || !isHm(w.closesAt)) {
      const err = new Error("Janelas de mudança usam HH:MM.");
      err.status = 400;
      throw err;
    }
  }

  updateMudanca.run({
    windows_json: JSON.stringify(
      windows.map((w) => ({
        days: w.days.map(Number),
        opensAt: w.opensAt,
        closesAt: w.closesAt,
      })),
    ),
    assembly_ref: input.assemblyRef?.trim() || null,
    updated_at: new Date().toISOString(),
    updated_by: actorUserId,
  });

  return getHorariosBundle().mudanca;
}

export function addBlockedDay({ date, reason, source = "custom" }, actorUserId) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const err = new Error("Data inválida (YYYY-MM-DD).");
    err.status = 400;
    throw err;
  }
  const src = source === "national" || source === "fortaleza" ? source : "custom";
  const id = randomUUID();
  try {
    insertBlocked.run({
      id,
      day_date: date,
      reason: String(reason || "Bloqueio").trim().slice(0, 200),
      source: src,
      created_by: actorUserId,
    });
  } catch (e) {
    if (String(e.message || "").includes("UNIQUE")) {
      const err = new Error("Já existe bloqueio nessa data.");
      err.status = 409;
      throw err;
    }
    throw e;
  }
  return getBlockedOn.get(date);
}

export function removeBlockedDay(id) {
  const row = sqlite.prepare("SELECT id FROM mudanca_blocked_days WHERE id = ?").get(id);
  if (!row) {
    const err = new Error("Bloqueio não encontrado.");
    err.status = 404;
    throw err;
  }
  deleteBlocked.run(id);
  return { ok: true };
}

export function putConvivenciaSettings(input, actorUserId) {
  if (!isHm(input.noiseUntil)) {
    const err = new Error("Informe o horário de silêncio no formato HH:MM.");
    err.status = 400;
    throw err;
  }
  updateConvivencia.run({
    noise_until: input.noiseUntil,
    assembly_ref: input.assemblyRef?.trim() || null,
    updated_at: new Date().toISOString(),
    updated_by: actorUserId,
  });
  return getHorariosBundle().convivencia;
}
