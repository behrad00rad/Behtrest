import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { request } from "./api";
import { useAuth } from "./auth";
export type ChatEvent = {
  type: string;
  conversation_id?: number;
  sender_id?: number;
  user_id?: number;
  active?: boolean;
  members?: { user_id: number; online: boolean }[];
};
const Context = createContext({
  version: 0,
  unread: 0,
  requests: 0,
  connected: false,
  event: { type: "idle" } as ChatEvent,
  send: (_event: ChatEvent) => {},
});
export const useChat = () => useContext(Context);
export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [version, setVersion] = useState(0);
  const [counts, setCounts] = useState({ unread: 0, requests: 0 });
  const [connected, setConnected] = useState(false);
  const [event, setEvent] = useState<ChatEvent>({ type: "idle" });
  const socket = useRef<WebSocket | null>(null);
  useEffect(() => {
    if (!user) {
      setCounts({ unread: 0, requests: 0 });
      return;
    }
    let stopped = false,
      failures = 0;
    let timer: ReturnType<typeof setTimeout>;
    const notified = new Map<number, number>();
    let notificationsEnabled = false;
    void request<{ browser_notifications: boolean }>("/chat/settings/")
      .then((p) => {
        notificationsEnabled = p.browser_notifications;
      })
      .catch(() => {});
    async function notify(data: ChatEvent) {
      if (
        !data.conversation_id ||
        !data.sender_id ||
        data.sender_id === user?.id ||
        !document.hidden ||
        !("Notification" in window) ||
        Notification.permission !== "granted"
      )
        return;
      try {
        const pref = await request<{ browser_notifications: boolean }>(
          "/chat/settings/",
        );
        notificationsEnabled = pref.browser_notifications;
        const c = await request<{
          accepted: boolean;
          muted: boolean;
          blocked: boolean;
          last_message: { id: number; sender: { id: number } } | null;
        }>(`/chat/conversations/${data.conversation_id}/`);
        const m = c.last_message;
        if (
          !stopped &&
          notificationsEnabled &&
          c.accepted &&
          !c.muted &&
          !c.blocked &&
          m &&
          m.sender.id !== user?.id &&
          m.id > (notified.get(data.conversation_id) || 0)
        ) {
          notified.set(data.conversation_id, m.id);
          new Notification("Bintrest", {
            body: "You have a new message.",
            tag: `chat-${data.conversation_id}`,
          });
        }
      } catch {
        /* Notifications are optional; saved messages remain available. */
      }
    }
    const sync = async () => {
      try {
        const data = await request<typeof counts>("/chat/summary/");
        if (!stopped) setCounts(data);
      } catch {
        /* Retain counts during disconnection. */
      }
      if (!stopped) setVersion((v) => v + 1);
    };
    function connect() {
      const ws = new WebSocket(
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws/chat/`,
      );
      socket.current = ws;
      ws.onopen = () => {
        failures = 0;
        setConnected(true);
        void sync();
      };
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data) as ChatEvent;
          setEvent(data);
          if (data.type === "refresh") {
            void sync();
            void notify(data);
          }
        } catch {
          /* Ignore malformed transient events. */
        }
      };
      ws.onclose = (e) => {
        setConnected(false);
        if (!stopped && e.code !== 4401)
          timer = setTimeout(connect, Math.min(30000, 1000 * 2 ** failures++));
      };
      ws.onerror = () => ws.close();
    }
    connect();
    void sync();
    const poll = setInterval(() => void sync(), 15000);
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(poll);
      socket.current?.close();
      socket.current = null;
      setConnected(false);
    };
  }, [user?.id]);
  return (
    <Context.Provider
      value={{
        version,
        ...counts,
        connected,
        event,
        send: (data) => {
          if (socket.current?.readyState === WebSocket.OPEN)
            socket.current.send(JSON.stringify(data));
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
