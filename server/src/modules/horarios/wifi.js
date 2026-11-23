const WIFI_SECURITIES = new Set(["WPA", "WEP", "nopass"]);

/** Escapa SSID/senha no formato WIFI: (\; , : \). */
export function escapeWifiField(value) {
  return String(value ?? "").replace(/([\\;,:"])/g, "\\$1");
}

/** Payload padrão de QR/config de Wi‑Fi (iOS Câmera / Android Wi‑Fi QR). */
export function buildWifiUri({ ssid, password, security = "WPA" }) {
  const type = WIFI_SECURITIES.has(security) ? security : "WPA";
  const s = escapeWifiField(ssid);
  if (type === "nopass") return `WIFI:T:nopass;S:${s};;`;
  return `WIFI:T:${type};S:${s};P:${escapeWifiField(password)};;`;
}

export function normalizeWifiSecurity(value) {
  return WIFI_SECURITIES.has(value) ? value : "WPA";
}

export { WIFI_SECURITIES };
