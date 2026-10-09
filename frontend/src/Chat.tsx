import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { ApiError, request, upload } from "./api";
import { useAuth } from "./auth";
import { useChat } from "./ChatContext";
import { Avatar, ErrorNotice, Modal, message } from "./components";
import type { Author, Page } from "./types";
type Member = Author & {
  role: string;
  accepted: boolean;
  last_read_id: number | null;
  last_delivered_id: number;
};
type Msg = {
  id: number;
  sender: Author;
  text: string;
  created_at: string;
  edited_at: string | null;
  deleted: boolean;
  reply: { id: number; text: string } | null;
  pin: { id: number; title: string; thumbnail: string } | null;
  attachment: { id: number; url: string } | null;
  reactions: { emoji: string; user_id: number }[];
};
type Conversation = {
  id: number;
  kind: string;
  title: string;
  members: Member[];
  accepted: boolean;
  role: string;
  muted: boolean;
  archived: boolean;
  blocked: boolean;
  can_send: boolean;
  unread: number;
  last_message: Msg | null;
};
type Prefs = {
  contact_policy: string;
  show_presence: boolean;
  show_read_receipts: boolean;
  browser_notifications: boolean;
};
const emojis = ["❤️", "👍", "😂", "✨", "😮", "😢"];
export default function Chat() {
  const { user } = useAuth(),
    live = useChat(),
    { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [folder, setFolder] = useState("inbox"),
    [search, setSearch] = useState("");
  const [list, setList] = useState<Conversation[]>([]),
    [listCursor, setListCursor] = useState<string | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null),
    [messages, setMessages] = useState<Msg[]>([]);
  const [cursor, setCursor] = useState<string | null>(null),
    [filter, setFilter] = useState("");
  const [text, setText] = useState(""),
    [reply, setReply] = useState<Msg | null>(null),
    [image, setImage] = useState<File | null>(null),
    [pin, setPin] = useState<number | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const [newChat, setNewChat] = useState(false),
    [group, setGroup] = useState(false),
    [names, setNames] = useState(""),
    [title, setTitle] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false),
    [prefs, setPrefs] = useState<Prefs | null>(null),
    [blockedUsers, setBlockedUsers] = useState<Author[]>([]);
  const [typing, setTyping] = useState(false),
    [online, setOnline] = useState<number[]>([]),
    [manage, setManage] = useState(false),
    [invite, setInvite] = useState(""),
    [notice, setNotice] = useState("");
  const timeline = useRef<HTMLDivElement>(null),
    sendKey = useRef<string | null>(null),
    pendingAttachment = useRef<number | null>(null),
    receipt = useRef("");
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const base = `/chat/conversations/${id}/`;
  const label = (c: Conversation) =>
    c.kind === "group"
      ? c.title
      : c.members.find((m) => m.id !== user?.id)?.display_name ||
        c.members.find((m) => m.id !== user?.id)?.username ||
        "Conversation";
  useEffect(() => {
    const controller = new AbortController();
    const t = setTimeout(() => {
      request<Page<Conversation>>(
        `/chat/conversations/?folder=${folder}&q=${encodeURIComponent(search)}`,
        "GET",
        undefined,
        true,
        controller.signal,
      )
        .then((p) => {
          setList(p.items);
          setListCursor(p.next_cursor);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(message(e));
        });
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [folder, search, live.version, revision]);
  useEffect(() => {
    setConversation(null);
    setMessages([]);
    messagesRef.current = [];
    setCursor(null);
    setReply(null);
    setImage(null);
    setText("");
    setFilter("");
    setError("");
    setOnline([]);
    setTyping(false);
    receipt.current = "";
    sendKey.current = null;
    pendingAttachment.current = null;
    const value = Number(params.get("pin"));
    setPin(value > 0 ? value : null);
  }, [id]);
  useEffect(() => {
    if (params.get("to") && !id) {
      setNames(params.get("to")!);
      setNewChat(true);
    }
  }, [params, id]);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    const bottom =
      !timeline.current ||
      timeline.current.scrollHeight -
        timeline.current.scrollTop -
        timeline.current.clientHeight <
        120;
    async function sync() {
      try {
        const c = await request<Conversation>(
          base,
          "GET",
          undefined,
          true,
          controller.signal,
        );
        let p = await request<Page<Msg>>(
          `${base}messages/?q=${encodeURIComponent(filter)}`,
          "GET",
          undefined,
          true,
          controller.signal,
        );
        const collected = [...p.items],
          oldest = messagesRef.current[0]?.id;
        // Re-fetch the displayed window on reconnect, including edits and deletions.
        while (
          oldest &&
          !filter &&
          p.next_cursor &&
          collected[collected.length - 1]?.id > oldest
        ) {
          p = await request<Page<Msg>>(
            `${base}messages/?cursor=${encodeURIComponent(p.next_cursor)}`,
            "GET",
            undefined,
            true,
            controller.signal,
          );
          collected.push(...p.items);
        }
        if (controller.signal.aborted) return;
        const newest = collected[0];
        setConversation(c);
        setMessages(collected.reverse());
        setCursor(p.next_cursor);
        if (bottom)
          requestAnimationFrame(() =>
            timeline.current?.scrollTo({ top: timeline.current.scrollHeight }),
          );
        const key = `${newest?.id}:${document.visibilityState}`;
        if (newest && receipt.current !== key) {
          receipt.current = key;
          await request(`${base}receipts/`, "POST", {
            message_id: newest.id,
            read: !document.hidden && c.accepted,
          });
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(message(e));
          if (e instanceof ApiError && [401, 404].includes(e.status)) {
            setConversation(null);
            setMessages([]);
          }
        }
      }
    }
    void sync();
    return () => controller.abort();
  }, [id, filter, live.version, revision]);
  useEffect(() => {
    if (!id) return;
    const ask = () =>
      live.send({ type: "presence", conversation_id: Number(id) });
    ask();
    const t = setInterval(ask, 15000);
    return () => clearInterval(t);
  }, [id, live.connected]);
  useEffect(() => {
    if (live.event.conversation_id !== Number(id)) return;
    if (live.event.type === "presence")
      setOnline(
        live.event.members?.filter((m) => m.online).map((m) => m.user_id) || [],
      );
    if (live.event.type === "typing") {
      setTyping(!!live.event.active);
      const t = setTimeout(() => setTyping(false), 3000);
      return () => clearTimeout(t);
    }
  }, [live.event, id]);
  useEffect(() => {
    const visible = () => {
      if (!document.hidden) setRevision((v) => v + 1);
    };
    document.addEventListener("visibilitychange", visible);
    return () => document.removeEventListener("visibilitychange", visible);
  }, []);
  useEffect(() => {
    request<Prefs>("/chat/settings/")
      .then(setPrefs)
      .catch(() => {});
  }, []);
  async function act(
    path: string,
    method: string,
    data?: Record<string, string | number | boolean>,
  ) {
    setError("");
    try {
      const value = await request<Conversation & { left?: boolean }>(
        path,
        method,
        data,
      );
      if (path === base || path.includes("members")) {
        if (value.left) {
          navigate("/messages");
          setManage(false);
        } else setConversation(value);
      }
      setRevision((v) => v + 1);
      return true;
    } catch (e) {
      setError(message(e));
      return false;
    }
  }
  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const c = await request<Conversation>(
        "/chat/conversations/",
        "POST",
        group ? { usernames: names, title } : { username: names },
      );
      setNewChat(false);
      setFolder(c.accepted ? "inbox" : "requests");
      setRevision((v) => v + 1);
      navigate(
        `/messages/${c.id}${params.get("pin") ? `?pin=${params.get("pin")}` : ""}`,
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    if (busy || !id) return;
    setBusy(true);
    setError("");
    sendKey.current ||= crypto.randomUUID();
    try {
      if (image && !pendingAttachment.current) {
        const form = new FormData();
        form.append("image", image);
        pendingAttachment.current = (
          await upload<{ id: number }>(`${base}attachments/`, form, () => {})
        ).id;
      }
      const data: Record<string, string | number> = {
        text,
        client_id: sendKey.current,
      };
      if (reply) data.reply_id = reply.id;
      if (pin) data.pin_id = pin;
      if (pendingAttachment.current)
        data.attachment_id = pendingAttachment.current;
      const m = await request<Msg>(`${base}messages/`, "POST", data);
      setMessages((prev) => [...prev.filter((x) => x.id !== m.id), m]);
      setText("");
      setReply(null);
      setImage(null);
      setPin(null);
      sendKey.current = null;
      pendingAttachment.current = null;
      setRevision((v) => v + 1);
      live.send({ type: "typing", conversation_id: Number(id), active: false });
      requestAnimationFrame(() =>
        timeline.current?.scrollTo({ top: timeline.current.scrollHeight }),
      );
    } catch (e) {
      if (
        e instanceof ApiError &&
        e.status < 500 &&
        !["network_error", "invalid_response"].includes(e.code)
      )
        sendKey.current = null;
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function more() {
    if (!cursor || busy) return;
    setBusy(true);
    const before = timeline.current?.scrollHeight || 0;
    try {
      const p = await request<Page<Msg>>(
        `${base}messages/?q=${encodeURIComponent(filter)}&cursor=${encodeURIComponent(cursor)}`,
      );
      setMessages((prev) => [...p.items.reverse(), ...prev]);
      setCursor(p.next_cursor);
      requestAnimationFrame(() => {
        if (timeline.current)
          timeline.current.scrollTop += timeline.current.scrollHeight - before;
      });
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function updateMessage(
    m: Msg,
    method: string,
    data?: Record<string, string>,
  ) {
    try {
      const value = await request<Msg>(`/chat/messages/${m.id}/`, method, data);
      setMessages((items) => items.map((x) => (x.id === value.id ? value : x)));
    } catch (e) {
      setError(message(e));
    }
  }
  async function react(m: Msg, emoji: string) {
    try {
      const value = await request<Msg>(
        `/chat/messages/${m.id}/reactions/`,
        m.reactions.some((r) => r.emoji === emoji && r.user_id === user?.id)
          ? "DELETE"
          : "POST",
        { emoji },
      );
      setMessages((items) => items.map((x) => (x.id === value.id ? value : x)));
    } catch (e) {
      setError(message(e));
    }
  }
  async function savePrefs(next: Prefs) {
    try {
      if (
        next.browser_notifications &&
        "Notification" in window &&
        (await Notification.requestPermission()) !== "granted"
      ) {
        setError(
          "Browser notifications were not allowed. In-app unread counts still work.",
        );
        next.browser_notifications = false;
      }
      setPrefs(await request<Prefs>("/chat/settings/", "PATCH", next));
    } catch (e) {
      setError(message(e));
    }
  }
  const allowed = !!conversation?.accepted && !conversation.blocked;
  const canSend = allowed && conversation.can_send;
  return (
    <main className="chat-page">
      <div className="chat-heading">
        <div>
          <span className="eyebrow">A LITTLE MORE CONNECTED</span>
          <h1>Messages</h1>
        </div>
        <div className="chat-tools">
          <span className="muted">
            {live.connected ? "Live" : "Reconnecting…"}
          </span>
          <button
            className="quiet-button"
            onClick={() => {
              setSettingsOpen(true);
              void request<{ items: Author[] }>("/chat/blocks/")
                .then((p) => setBlockedUsers(p.items))
                .catch((e) => setError(message(e)));
            }}
          >
            Privacy
          </button>
          <button className="primary-button" onClick={() => setNewChat(true)}>
            New conversation
          </button>
        </div>
      </div>
      <ErrorNotice error={error} />
      {notice && <p role="status">{notice}</p>}
      <div className={`chat-layout ${id ? "chat-selected" : ""}`}>
        <aside className="chat-inbox">
          <div className="chat-folders">
            {["inbox", "requests", "archive"].map((f) => (
              <button
                key={f}
                aria-pressed={folder === f}
                onClick={() => setFolder(f)}
              >
                {f}
                {f === "requests" && live.requests ? ` (${live.requests})` : ""}
              </button>
            ))}
          </div>
          <input
            aria-label="Search conversations"
            placeholder="Search conversations"
            value={search}
            maxLength={100}
            onChange={(e) => setSearch(e.target.value)}
          />
          {list.map((c) => (
            <Link
              className={`conversation-row ${String(c.id) === id ? "selected" : ""}`}
              key={c.id}
              to={`/messages/${c.id}${params.get("pin") ? `?pin=${params.get("pin")}` : ""}`}
            >
              <strong>{label(c)}</strong>
              <span>
                {c.last_message?.deleted
                  ? "Message deleted"
                  : c.last_message?.text ||
                    (c.last_message ? "Shared an image or pin" : "Say hello")}
              </span>
              {c.unread > 0 && <b>{c.unread}</b>}
            </Link>
          ))}
          {!list.length && <p className="muted">No conversations here yet.</p>}
          {listCursor && (
            <button
              className="quiet-button"
              onClick={async () => {
                try {
                  const p = await request<Page<Conversation>>(
                    `/chat/conversations/?folder=${folder}&q=${encodeURIComponent(search)}&cursor=${encodeURIComponent(listCursor)}`,
                  );
                  setList((v) => [...v, ...p.items]);
                  setListCursor(p.next_cursor);
                } catch (e) {
                  setError(message(e));
                }
              }}
            >
              More conversations
            </button>
          )}
        </aside>
        <section className="chat-room" aria-label="Conversation">
          {!id ? (
            <div className="chat-empty">
              <h2>A conversation starts with hello.</h2>
              <p>
                Choose a chat or start one with someone whose ideas you like.
              </p>
              {params.get("pin") && (
                <p>Choose a conversation to share your pin.</p>
              )}
            </div>
          ) : !conversation ? (
            <p role="status">
              {error
                ? "This conversation is unavailable."
                : "Loading conversation…"}
            </p>
          ) : (
            <>
              <header className="chat-room-header">
                <Link className="mobile-chat-back" to="/messages">
                  ← Inbox
                </Link>
                <div>
                  <h2>{label(conversation)}</h2>
                  <span className="muted">
                    {conversation.members.length} people
                    {online.length ? " · Someone is online" : ""}
                  </span>
                </div>
                <button
                  className="quiet-button"
                  onClick={() => setManage(true)}
                >
                  Details
                </button>
              </header>
              <input
                className="chat-search"
                aria-label="Search messages"
                placeholder="Search in this conversation"
                value={filter}
                maxLength={100}
                onChange={(e) => setFilter(e.target.value)}
              />
              {!conversation.accepted && (
                <div className="chat-request">
                  <p>
                    {conversation.kind === "group"
                      ? "You were invited to this group."
                      : "Someone wants to start a conversation."}{" "}
                    Accept to reply.
                  </p>
                  <button
                    className="primary-button"
                    onClick={() => void act(base, "PATCH", { accept: true })}
                  >
                    Accept conversation
                  </button>
                  <button
                    className="quiet-button"
                    onClick={() => void act(base, "PATCH", { leave: true })}
                  >
                    Decline
                  </button>
                </div>
              )}
              {conversation.blocked && (
                <p className="chat-request">
                  Messaging is unavailable for this conversation.
                </p>
              )}
              <div
                className="chat-timeline"
                ref={timeline}
                role="log"
                aria-label="Messages"
                aria-live="polite"
              >
                {cursor && (
                  <button
                    className="quiet-button"
                    disabled={busy}
                    onClick={() => void more()}
                  >
                    Load older messages
                  </button>
                )}
                {messages.map((m) => (
                  <article
                    key={m.id}
                    className={`chat-message ${m.sender.id === user?.id ? "own" : ""}`}
                  >
                    <div className="chat-message-author">
                      <Avatar author={m.sender} size="small" />
                      <Link to={`/u/${m.sender.username}`}>
                        {m.sender.display_name || m.sender.username}
                      </Link>
                      <time dateTime={m.created_at}>
                        {new Date(m.created_at).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                    <div className="message-bubble">
                      {m.reply && (
                        <blockquote>
                          {m.reply.text || "Shared image or pin"}
                        </blockquote>
                      )}
                      {m.deleted ? (
                        <em>Message deleted</em>
                      ) : (
                        <>
                          <p>{m.text}</p>
                          {m.pin && (
                            <Link
                              className="chat-pin"
                              to={`/posts/${m.pin.id}`}
                            >
                              <img src={m.pin.thumbnail} alt="" />
                              <strong>{m.pin.title}</strong>
                            </Link>
                          )}
                          {m.attachment && (
                            <a
                              href={m.attachment.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <img
                                className="chat-image"
                                src={m.attachment.url}
                                alt="Shared chat image"
                                loading="lazy"
                              />
                            </a>
                          )}
                          {m.edited_at && (
                            <small className="muted">Edited</small>
                          )}
                        </>
                      )}
                    </div>
                    {!m.deleted && (
                      <div className="chat-message-actions">
                        {allowed && (
                          <>
                            <button onClick={() => setReply(m)}>Reply</button>
                            <details>
                              <summary>React</summary>
                              <div>
                                {emojis.map((emoji) => (
                                  <button
                                    key={emoji}
                                    aria-label={`React ${emoji}`}
                                    aria-pressed={m.reactions.some(
                                      (r) =>
                                        r.emoji === emoji &&
                                        r.user_id === user?.id,
                                    )}
                                    onClick={() => void react(m, emoji)}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            </details>
                          </>
                        )}
                        {m.sender.id === user?.id ? (
                          <>
                            {allowed && (
                              <button
                                onClick={() => {
                                  const value = window.prompt(
                                    "Edit message",
                                    m.text,
                                  );
                                  if (value !== null)
                                    void updateMessage(m, "PATCH", {
                                      text: value,
                                    });
                                }}
                              >
                                Edit
                              </button>
                            )}
                            <button
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "Delete this message for everyone?",
                                  )
                                )
                                  void updateMessage(m, "DELETE");
                              }}
                            >
                              Delete
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={async () => {
                              const reason = window.prompt(
                                "Why are you reporting this message?",
                              );
                              if (
                                reason &&
                                (await act(
                                  `/chat/messages/${m.id}/report/`,
                                  "POST",
                                  { reason },
                                ))
                              )
                                setNotice("Report sent for review.");
                            }}
                          >
                            Report
                          </button>
                        )}
                      </div>
                    )}
                    {m.reactions.length > 0 && (
                      <div aria-label="Reactions">
                        {emojis
                          .filter((e) => m.reactions.some((r) => r.emoji === e))
                          .map((e) => (
                            <span key={e}>
                              {e}{" "}
                              {
                                m.reactions.filter((r) => r.emoji === e).length
                              }{" "}
                            </span>
                          ))}
                      </div>
                    )}
                    {m.sender.id === user?.id && !m.deleted && (
                      <small className="muted">
                        {conversation.members.some(
                          (peer) =>
                            peer.id !== user.id &&
                            (peer.last_read_id || 0) >= m.id,
                        )
                          ? "Read"
                          : conversation.members.some(
                                (peer) =>
                                  peer.id !== user.id &&
                                  peer.last_delivered_id >= m.id,
                              )
                            ? "Delivered"
                            : "Sent"}
                      </small>
                    )}
                  </article>
                ))}
                {!messages.length && (
                  <p className="muted">
                    {filter
                      ? "No messages match that search."
                      : "Say hello. Make a connection."}
                  </p>
                )}
              </div>
              <p className="chat-typing" role="status">
                {typing ? "Someone is typing…" : ""}
              </p>
              <form className="chat-composer" onSubmit={send}>
                {allowed && !canSend && !sendKey.current && (
                  <p className="muted">
                    Waiting for the other person to accept your message request.
                  </p>
                )}
                {reply && (
                  <div className="chat-compose-preview">
                    Replying to: {reply.text.slice(0, 100)}{" "}
                    <button
                      type="button"
                      disabled={busy || !!sendKey.current}
                      onClick={() => setReply(null)}
                    >
                      Remove reply
                    </button>
                  </div>
                )}
                {pin && (
                  <div className="chat-compose-preview">
                    Sharing pin #{pin}{" "}
                    <button
                      type="button"
                      disabled={busy || !!sendKey.current}
                      onClick={() => setPin(null)}
                    >
                      Remove pin
                    </button>
                  </div>
                )}
                {image && (
                  <div className="chat-compose-preview">
                    {image.name}{" "}
                    <button
                      type="button"
                      disabled={busy || !!sendKey.current}
                      onClick={() => {
                        setImage(null);
                        pendingAttachment.current = null;
                        sendKey.current = null;
                      }}
                    >
                      Remove image
                    </button>
                  </div>
                )}
                <textarea
                  aria-label="Message"
                  placeholder="Write a message…"
                  maxLength={4000}
                  value={text}
                  disabled={!canSend || busy || !!sendKey.current}
                  onChange={(e) => {
                    setText(e.target.value);
                    if (!sendKey.current)
                      live.send({
                        type: "typing",
                        conversation_id: Number(id),
                        active: true,
                      });
                  }}
                />
                <div>
                  <label className="quiet-button">
                    Attach image
                    <input
                      aria-label="Attach image"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={!canSend || busy || !!sendKey.current}
                      onChange={(e) => {
                        setImage(e.target.files?.[0] || null);
                        pendingAttachment.current = null;
                        sendKey.current = null;
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <span className="muted">{text.length}/4000</span>
                  <button
                    className="primary-button"
                    disabled={
                      (!canSend && !sendKey.current) ||
                      busy ||
                      (!text.trim() && !image && !pin)
                    }
                  >
                    {busy
                      ? "Sending…"
                      : sendKey.current
                        ? "Retry send"
                        : "Send message"}
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
      {newChat && (
        <Modal title="New conversation" close={() => setNewChat(false)}>
          <form className="form-stack" onSubmit={create}>
            <label>
              <input
                type="checkbox"
                checked={group}
                onChange={(e) => setGroup(e.target.checked)}
              />{" "}
              Group conversation
            </label>
            {group && (
              <label>
                Group name
                <input
                  value={title}
                  maxLength={100}
                  required
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
            )}
            <label>
              {group ? "Usernames, separated by commas" : "Username"}
              <input
                value={names}
                maxLength={group ? 1500 : 150}
                required
                onChange={(e) => setNames(e.target.value)}
              />
            </label>
            <p className="muted">
              New conversations may arrive as a request. Groups have up to 20
              people.
            </p>
            <ErrorNotice error={error} />
            <button className="primary-button" disabled={busy}>
              {busy ? "Starting…" : "Start conversation"}
            </button>
          </form>
        </Modal>
      )}
      {settingsOpen && prefs && (
        <Modal title="Chat privacy" close={() => setSettingsOpen(false)}>
          <div className="form-stack">
            <label>
              Who can contact you?
              <select
                value={prefs.contact_policy}
                onChange={(e) =>
                  void savePrefs({ ...prefs, contact_policy: e.target.value })
                }
              >
                <option value="requests">Message requests</option>
                <option value="everyone">Everyone</option>
                <option value="nobody">Nobody new</option>
              </select>
            </label>
            {(
              [
                "show_presence",
                "show_read_receipts",
                "browser_notifications",
              ] as const
            ).map((key) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={prefs[key]}
                  onChange={(e) =>
                    void savePrefs({ ...prefs, [key]: e.target.checked })
                  }
                />
                {key === "show_presence"
                  ? "Show when I’m online"
                  : key === "show_read_receipts"
                    ? "Share read receipts"
                    : "Browser notifications"}
              </label>
            ))}
            <p className="muted">
              Blocking stops direct messages and new invitations from that
              person. Shared groups remain visible.
            </p>
            <h3>Blocked people</h3>
            {blockedUsers.map((person) => (
              <div key={person.username}>
                {person.username}
                <button
                  className="quiet-button"
                  onClick={async () => {
                    if (
                      await act("/chat/blocks/", "DELETE", {
                        username: person.username,
                      })
                    )
                      setBlockedUsers((v) =>
                        v.filter((x) => x.username !== person.username),
                      );
                  }}
                >
                  Unblock
                </button>
              </div>
            ))}
            <ErrorNotice error={error} />
          </div>
        </Modal>
      )}
      {manage && conversation && (
        <Modal title="Conversation details" close={() => setManage(false)}>
          <div className="form-stack">
            <ErrorNotice error={error} />
            <button
              className="quiet-button"
              onClick={() =>
                void act(base, "PATCH", { muted: !conversation.muted })
              }
            >
              {conversation.muted ? "Unmute" : "Mute"} conversation
            </button>
            <button
              className="quiet-button"
              onClick={() =>
                void act(base, "PATCH", { archived: !conversation.archived })
              }
            >
              {conversation.archived ? "Unarchive" : "Archive"} conversation
            </button>
            {conversation.kind === "direct" && (
              <button
                className="quiet-button"
                onClick={() => {
                  const peer = conversation.members.find(
                    (m) => m.id !== user?.id,
                  );
                  if (peer)
                    void act("/chat/blocks/", "POST", {
                      username: peer.username,
                    }).then(() => setManage(false));
                }}
              >
                Block person
              </button>
            )}
            {conversation.kind === "group" && conversation.role === "admin" && (
              <>
                <button
                  className="quiet-button"
                  onClick={() => {
                    const value = window.prompt(
                      "Group name",
                      conversation.title,
                    );
                    if (value) void act(base, "PATCH", { title: value });
                  }}
                >
                  Rename group
                </button>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act(`${base}members/`, "POST", {
                      username: invite,
                    }).then((ok) => {
                      if (ok) setInvite("");
                    });
                  }}
                >
                  <label>
                    Invite username
                    <input
                      value={invite}
                      required
                      onChange={(e) => setInvite(e.target.value)}
                    />
                  </label>
                  <button className="primary-button">Invite</button>
                </form>
              </>
            )}
            {conversation.members.map((m) => (
              <div className="chat-member" key={m.id}>
                <span>
                  {m.display_name || m.username} ·{" "}
                  {m.accepted ? m.role : "invited"}
                </span>
                {conversation.kind === "group" &&
                  conversation.role === "admin" && (
                    <div>
                      {m.accepted && (
                        <button
                          onClick={() =>
                            void act(`${base}members/`, "PATCH", {
                              username: m.username,
                              role: m.role === "admin" ? "member" : "admin",
                            })
                          }
                        >
                          {m.role === "admin" ? "Make member" : "Make admin"}
                        </button>
                      )}
                      {m.id !== user?.id && (
                        <button
                          onClick={() =>
                            void act(`${base}members/`, "DELETE", {
                              username: m.username,
                            })
                          }
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  )}
              </div>
            ))}
            <button
              className="quiet-button"
              onClick={() => {
                if (
                  window.confirm(
                    "Leave this conversation? You will lose access to its history.",
                  )
                )
                  void act(base, "PATCH", { leave: true });
              }}
            >
              Leave conversation
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
