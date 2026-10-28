import { getSession, request } from "./api";

export type PushPreferences = {
  messages: boolean;
  requests: boolean;
  follows: boolean;
  pins: boolean;
};
export const defaultPushPreferences: PushPreferences = {
  messages: true,
  requests: true,
  follows: true,
  pins: false,
};
export function pushSupported() {
  return (
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    typeof window.PushManager !== "undefined" &&
    "Notification" in window
  );
}
export async function pushRegistration() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}
export async function currentPush() {
  if (!pushSupported()) return null;
  return (await pushRegistration()).pushManager.getSubscription();
}
export async function savePush(sub: PushSubscription, prefs: PushPreferences) {
  const data = sub.toJSON();
  await request("/push/subscriptions/", "POST", {
    endpoint: data.endpoint,
    p256dh: data.keys?.p256dh,
    auth: data.keys?.auth,
    ...prefs,
  });
}
export async function enablePush(prefs = defaultPushPreferences) {
  const appleMobile =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const installed =
    matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone;
  if (!pushSupported() || (appleMobile && !installed))
    throw new Error(
      "On iPhone, add Behtrest to your Home Screen, open it there, then enable notifications.",
    );
  // Request permission directly from the button tap (required by Safari).
  if ((await Notification.requestPermission()) !== "granted") {
    throw new Error(
      "Notifications are blocked. Allow them in your browser or device settings, then try again.",
    );
  }
  const config = await request<{ enabled: boolean; public_key: string }>(
    "/push/subscriptions/",
  );
  if (!config.enabled)
    throw new Error(
      "Notifications are not configured yet. Please try again later.",
    );
  await pushRegistration();
  const registration = await navigator.serviceWorker.ready;
  let sub = await registration.pushManager.getSubscription();
  if (!sub) {
    const bytes = Uint8Array.from(
      atob(config.public_key.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0),
    );
    sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: bytes,
    });
  }
  try {
    await savePush(sub, prefs);
  } catch (error) {
    await sub.unsubscribe();
    throw error;
  }
  const session = await getSession();
  if (session.user)
    localStorage.setItem("behtrest-push-owner", String(session.user.id));
  return sub;
}
export async function disablePush() {
  const sub = await currentPush();
  if (!sub) return;
  // Revocation at the provider protects shared devices even if the API is offline.
  await sub.unsubscribe();
  localStorage.removeItem("behtrest-push-owner");
  await request("/push/subscriptions/", "DELETE", { endpoint: sub.endpoint });
}
