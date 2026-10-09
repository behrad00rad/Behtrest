import type { Msg } from "./Chat";
export type ChatDraft = {
  text: string;
  clientId?: string | null;
  attachmentId?: number | null;
  reply?: Msg | null;
  pin?: number | null;
};
const memory = new Map<string, ChatDraft>();
export const draftKey = (
  user: number | undefined,
  conversation: string | undefined,
) => `bintrest:chat-draft:${user}:${conversation}`;
export function readDraft(key: string): ChatDraft {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) {
      const value = JSON.parse(raw);
      if (typeof value.text === "string" && value.text.length <= 4000)
        return value;
    }
  } catch {
    /* Storage can be unavailable in private browsing. */
  }
  return memory.get(key) || { text: "" };
}
export function writeDraft(key: string, value: ChatDraft) {
  memory.set(key, value);
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Keep the draft in memory when storage is unavailable. */
  }
}
export function clearDraft(key: string) {
  memory.delete(key);
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* The memory copy has been cleared. */
  }
}

export function clearUserDrafts(user: number) {
  const prefix = `bintrest:chat-draft:${user}:`;
  for (const key of memory.keys())
    if (key.startsWith(prefix)) memory.delete(key);
  try {
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith(prefix)) sessionStorage.removeItem(key);
  } catch {
    /* The memory copies have been cleared. */
  }
}
