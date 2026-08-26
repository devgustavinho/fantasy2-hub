import { api } from "@/lib/api";

function urlBase64ToUint8Array(base64Url: string) {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function supportsPush() {
  return "serviceWorker" in navigator && "PushManager" in window;
}

async function getSubscription() {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function getCurrentPushSubscription() {
  if (!supportsPush()) return null;
  await navigator.serviceWorker.register("/sw.js");
  return getSubscription();
}

export async function enablePush() {
  const registration = await navigator.serviceWorker.register("/sw.js");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Permissão de notificação negada.");
  }

  const { publicKey } = await api.get<{ publicKey: string }>("/push/vapid-public-key");
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  await api.post("/push/subscribe", subscription.toJSON());
  return subscription;
}

export async function disablePush() {
  const subscription = await getSubscription();
  if (!subscription) return;
  await api.delete("/push/subscribe", { endpoint: subscription.endpoint });
  await subscription.unsubscribe();
}
