/* Notifications only: deliberately no fetch handler or offline cache. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { /* Show a safe fallback. */ }
  const url = new URL(typeof data.url === "string" ? data.url : "/messages", self.location.origin);
  event.waitUntil(self.registration.showNotification(data.title || "Behtrest", {
    body: data.body || "You have a new notification.",
    icon: "/icons/notification-192.png",
    badge: "/icons/notification-192.png",
    tag: data.tag || "behtrest",
    data: { url: url.origin === self.location.origin ? url.href : new URL("/messages", self.location.origin).href },
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/messages", self.location.origin);
  if (url.origin !== self.location.origin) return;
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({type: "window", includeUncontrolled: true});
    for (const tab of tabs) {
      if (new URL(tab.url).origin === url.origin && "navigate" in tab) {
        await tab.navigate(url.href);
        await tab.focus();
        return;
      }
    }
    await self.clients.openWindow(url.href);
  })());
});
