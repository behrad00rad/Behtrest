import { request } from "./api";

const sent = new Map<string, number>();
export async function recordPinEvent(
  id: number,
  type: "view" | "click" | "hide",
  userId?: number,
) {
  const key = `${userId || 0}:${id}:${type}`;
  const now = Date.now();
  if (
    type !== "hide" &&
    now - (sent.get(key) || 0) < (type === "view" ? 60000 : 1000)
  )
    return;
  sent.set(key, now);
  try {
    await request(`/pins/${id}/events/`, "POST", { type });
  } catch (error) {
    sent.delete(key);
    if (type === "hide") throw error;
  }
}
