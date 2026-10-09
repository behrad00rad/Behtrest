import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowLeft,
  Search,
  SquarePen,
  Settings2,
  MessageCircle,
  Users,
  Send,
  ImagePlus,
  X,
  Info,
  ShieldCheck,
  ArrowDown,
} from "lucide-react";
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
import { PeoplePicker, PeopleResults } from "./PeopleSearch";
import ChatMessage from "./ChatMessage";
import SharedMedia from "./SharedMedia";
import { clearDraft, draftKey, readDraft, writeDraft } from "./chatDrafts";
type Member = Author & {
  role: string;
  accepted: boolean;
  last_read_id: number | null;
  last_delivered_id: number;
};
export type Msg = {
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
  first_unread_id: number | null;
  last_read_id: number;
};
type Prefs = {
  contact_policy: string;
  show_presence: boolean;
  show_read_receipts: boolean;
  browser_notifications: boolean;
};
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
    [selectedPeople, setSelectedPeople] = useState<Author[]>([]),
    [initialPerson, setInitialPerson] = useState(""),
    [title, setTitle] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false),
    [prefs, setPrefs] = useState<Prefs | null>(null),
    [blockedUsers, setBlockedUsers] = useState<Author[]>([]);
  const [editing, setEditing] = useState<Msg | null>(null),
    [editText, setEditText] = useState(""),
    [reporting, setReporting] = useState<Msg | null>(null),
    [reportReason, setReportReason] = useState(""),
    [renaming, setRenaming] = useState(false),
    [renameText, setRenameText] = useState(""),
    [confirmation, setConfirmation] = useState<{
      title: string;
      body: string;
      action: string;
      run: () => Promise<boolean>;
    } | null>(null);
  const [typing, setTyping] = useState(false),
    [online, setOnline] = useState<number[]>([]),
    [manage, setManage] = useState(false),
    [invitePeople, setInvitePeople] = useState<Author[]>([]),
    [notice, setNotice] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const [unreadTarget, setUnreadTarget] = useState<number | null>(null);
  const [historyAnchor, setHistoryAnchor] = useState<number | null>(null);
  const unreadCaptured = useRef(false);
  const scrollTarget = useRef<number | null>(null);
  const currentDraftKey = draftKey(user?.id, id);
  const composer = useRef<HTMLTextAreaElement>(null);
  const [imagePreview, setImagePreview] = useState("");
  useEffect(() => {
    if (!image) {
      setImagePreview("");
      return;
    }
    const url = URL.createObjectURL(image);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);
  useEffect(() => {
    if (composer.current) {
      composer.current.style.height = "auto";
      composer.current.style.height = `${Math.min(composer.current.scrollHeight, 130)}px`;
    }
  }, [text, conversation]);
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
    setListLoading(true);
    const t = setTimeout(() => {
      request<Page<Conversation>>(
        `/chat/conversations/?folder=${folder}&q=${encodeURIComponent(search.trim().replace(/^@/, ""))}`,
        "GET",
        undefined,
        true,
        controller.signal,
      )
        .then((p) => {
          setList(p.items);
          setListCursor(p.next_cursor);
          setListLoading(false);
        })
        .catch((e) => {
          if (!controller.signal.aborted) {
            setError(message(e));
            setListLoading(false);
          }
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
    const draft = readDraft(currentDraftKey);
    setReply(draft.reply || null);
    setImage(null);
    setText(draft.text);
    setFilter("");
    setError("");
    setOnline([]);
    setTyping(false);
    setSearchOpen(false);
    setManage(false);
    setMediaOpen(false);
    setAwayFromBottom(false);
    setUnreadTarget(null);
    setHistoryAnchor(null);
    unreadCaptured.current = false;
    scrollTarget.current = null;
    receipt.current = "";
    sendKey.current = draft.clientId || null;
    pendingAttachment.current = draft.attachmentId || null;
    const value = Number(params.get("pin"));
    setPin(value > 0 ? value : draft.pin || null);
  }, [id]);
  useEffect(() => {
    if (params.get("to") && !id) {
      setInitialPerson(params.get("to")!);
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
          `${base}messages/?q=${encodeURIComponent(filter)}${historyAnchor ? `&around=${historyAnchor}` : ""}`,
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
        if (!unreadCaptured.current) {
          setUnreadTarget(c.first_unread_id);
          unreadCaptured.current = true;
        }
        setMessages(collected.reverse());
        setCursor(p.next_cursor);
        if (scrollTarget.current) {
          const target = scrollTarget.current;
          requestAnimationFrame(() => {
            timeline.current
              ?.querySelector(`[data-message-id="${target}"]`)
              ?.scrollIntoView({ block: "center" });
          });
          scrollTarget.current = null;
        } else if (bottom && !historyAnchor)
          requestAnimationFrame(() =>
            timeline.current?.scrollTo({ top: timeline.current.scrollHeight }),
          );
        const key = `${newest?.id}:${document.visibilityState}:${bottom && !filter && !historyAnchor}`;
        if (newest && receipt.current !== key) {
          receipt.current = key;
          await request(`${base}receipts/`, "POST", {
            message_id: newest.id,
            read:
              !document.hidden &&
              c.accepted &&
              bottom &&
              !filter &&
              !historyAnchor,
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
  }, [id, filter, historyAnchor, awayFromBottom, live.version, revision]);
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
      if (live.event.user_id === user?.id) return;
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
        group
          ? {
              usernames: selectedPeople.map((p) => p.username).join(","),
              title,
            }
          : { username: selectedPeople[0]?.username },
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
  async function startDirect(person: Author) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const c = await request<Conversation>("/chat/conversations/", "POST", {
        username: person.username,
      });
      setSearch("");
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
    const rememberSend = () =>
      writeDraft(currentDraftKey, {
        text,
        clientId: sendKey.current,
        attachmentId: pendingAttachment.current,
        reply,
        pin,
      });
    rememberSend();
    try {
      if (image && !pendingAttachment.current) {
        const form = new FormData();
        form.append("image", image);
        pendingAttachment.current = (
          await upload<{ id: number }>(`${base}attachments/`, form, () => {})
        ).id;
        rememberSend();
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
      clearDraft(currentDraftKey);
      setHistoryAnchor(null);
      setAwayFromBottom(false);
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
      rememberSend();
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
      return true;
    } catch (e) {
      setError(message(e));
      return false;
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
  function confirmAction(
    title: string,
    body: string,
    action: string,
    run: () => Promise<boolean>,
  ) {
    setConfirmation({ title, body, action, run });
  }
  async function submitReport(event: FormEvent) {
    event.preventDefault();
    if (!reporting || !reportReason.trim()) return;
    if (
      await act(`/chat/messages/${reporting.id}/report/`, "POST", {
        reason: reportReason.trim(),
      })
    ) {
      setReporting(null);
      setReportReason("");
      setNotice("Report sent for review.");
    }
  }
  async function submitRename(event: FormEvent) {
    event.preventDefault();
    if (!renameText.trim()) return;
    if (await act(base, "PATCH", { title: renameText.trim() }))
      setRenaming(false);
  }
  const allowed = !!conversation?.accepted && !conversation.blocked;
  function jumpToMessage(target: number) {
    setMediaOpen(false);
    setManage(false);
    setFilter("");
    setSearchOpen(false);
    const element = timeline.current?.querySelector(
      `[data-message-id="${target}"]`,
    );
    if (element && !filter) element.scrollIntoView({ block: "center" });
    else {
      messagesRef.current = [];
      scrollTarget.current = target;
      setHistoryAnchor(target);
      setRevision((v) => v + 1);
    }
    setAwayFromBottom(true);
  }
  function jumpLatest() {
    setFilter("");
    setSearchOpen(false);
    setHistoryAnchor(null);
    setUnreadTarget(null);
    setAwayFromBottom(false);
    messagesRef.current = [];
    timeline.current?.scrollTo({ top: timeline.current.scrollHeight });
    setRevision((v) => v + 1);
  }
  const canSend = allowed && conversation.can_send;
  return (
    <main className={`chat-page messenger ${id ? "has-conversation" : ""}`}>
      <div className="chat-layout">
        <aside className="chat-inbox" aria-label="Inbox">
          <header className="inbox-heading">
            <div>
              <h1>Messages</h1>
              <span
                className={`connection-status ${live.connected ? "connected" : ""}`}
              >
                <i />
                {live.connected ? "Live" : "Reconnecting…"}
              </span>
            </div>
            <div className="inbox-actions">
              <button
                className="icon-button"
                aria-label="Privacy"
                title="Chat privacy"
                onClick={() => {
                  setSettingsOpen(true);
                  void request<{ items: Author[] }>("/chat/blocks/")
                    .then((p) => setBlockedUsers(p.items))
                    .catch((e) => setError(message(e)));
                }}
              >
                <Settings2 size={19} />
              </button>
              <button
                className="icon-button compose-new"
                aria-label="New conversation"
                title="New conversation"
                onClick={() => {
                  setSelectedPeople([]);
                  setInitialPerson("");
                  setError("");
                  setNewChat(true);
                }}
              >
                <SquarePen size={20} />
              </button>
            </div>
          </header>
          <label className="messenger-search">
            <Search size={17} />
            <input
              aria-label="Search conversations and people"
              placeholder="Search chats or @username"
              value={search}
              maxLength={100}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch("")}
              >
                <X size={15} />
              </button>
            )}
          </label>
          <div className="chat-folders" aria-label="Message folders">
            {["inbox", "requests", "archive"].map((f) => (
              <button
                key={f}
                aria-pressed={folder === f}
                onClick={() => setFolder(f)}
              >
                {f}
                {f === "requests" && live.requests > 0 && (
                  <b>{live.requests}</b>
                )}
              </button>
            ))}
          </div>
          <div className="inbox-scroll">
            {!id && <ErrorNotice error={error} />}
            {search && <h2 className="inbox-section-label">Conversations</h2>}
            {list.map((c) => {
              const peer = c.members.find((m) => m.id !== user?.id);
              return (
                <Link
                  className={`conversation-row ${String(c.id) === id ? "selected" : ""} ${c.unread ? "unread" : ""}`}
                  key={c.id}
                  to={`/messages/${c.id}${params.get("pin") ? `?pin=${params.get("pin")}` : ""}`}
                >
                  <span className="conversation-avatar">
                    {c.kind === "group" ? (
                      <span className="group-avatar">
                        <Users size={22} />
                      </span>
                    ) : peer ? (
                      <Avatar author={peer} size="small" />
                    ) : (
                      <MessageCircle size={24} />
                    )}
                  </span>
                  <span className="conversation-copy">
                    <span className="conversation-top">
                      <strong>{label(c)}</strong>
                      {c.last_message && (
                        <time dateTime={c.last_message.created_at}>
                          {new Date(
                            c.last_message.created_at,
                          ).toLocaleDateString() ===
                          new Date().toLocaleDateString()
                            ? new Date(
                                c.last_message.created_at,
                              ).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : new Date(
                                c.last_message.created_at,
                              ).toLocaleDateString([], {
                                month: "short",
                                day: "numeric",
                              })}
                        </time>
                      )}
                    </span>
                    <span className="conversation-preview">
                      <span>
                        {c.last_message?.sender.id === user?.id &&
                        !c.last_message?.deleted
                          ? "You: "
                          : ""}
                        {c.last_message?.deleted
                          ? "Message deleted"
                          : c.last_message?.text ||
                            (c.last_message?.attachment
                              ? "Shared a photo"
                              : c.last_message?.pin
                                ? "Shared a pin"
                                : "Start the conversation")}
                      </span>
                      {c.unread > 0 && <b>{c.unread}</b>}
                    </span>
                  </span>
                </Link>
              );
            })}
            {!list.length && (
              <div className="inbox-empty">
                {listLoading ? (
                  <p role="status">Loading chats…</p>
                ) : (
                  <>
                    <MessageCircle size={28} />
                    <strong>
                      {search
                        ? "No matching chats"
                        : folder === "requests"
                          ? "You're all caught up"
                          : folder === "archive"
                            ? "No archived chats"
                            : "Your inbox starts here"}
                    </strong>
                    <p>
                      {search
                        ? "Search people below to start a conversation."
                        : folder === "requests"
                          ? "New message requests will appear here."
                          : folder === "archive"
                            ? "Archived conversations will appear here."
                            : "Find a friend and share something you love."}
                    </p>
                  </>
                )}
              </div>
            )}
            {listCursor && (
              <button
                className="quiet-button inbox-more"
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
            {search && (
              <>
                <h2 className="inbox-section-label">
                  People · start a conversation
                </h2>
                <PeopleResults
                  query={search}
                  choose={(person) => void startDirect(person)}
                />
              </>
            )}
          </div>
          <div className="inbox-footer">
            <ShieldCheck size={14} />
            <span>You decide who can message you.</span>
          </div>
        </aside>
        <section className="chat-room" aria-label="Conversation">
          <div className="chat-feedback">
            <ErrorNotice error={error} />
            {notice && (
              <p role="status">
                {notice}
                <button
                  className="icon-button"
                  aria-label="Dismiss notification"
                  onClick={() => setNotice("")}
                >
                  <X size={16} />
                </button>
              </p>
            )}
          </div>
          {!id ? (
            <div className="chat-empty">
              <div className="chat-empty-icon">
                <MessageCircle size={38} />
                <span>
                  <SquarePen size={18} />
                </span>
              </div>
              <h2>Your ideas. Your people.</h2>
              <p>Share a pin, say hello, or pick up where you left off.</p>
              {params.get("pin") && (
                <p>Choose a conversation to share your pin.</p>
              )}
              <button
                className="primary-button"
                onClick={() => {
                  setSelectedPeople([]);
                  setInitialPerson("");
                  setNewChat(true);
                }}
              >
                <SquarePen size={17} />
                New conversation
              </button>
              <small>
                New connections arrive as requests. You're in control.
              </small>
            </div>
          ) : !conversation ? (
            <div className="chat-empty" role="status">
              <MessageCircle size={32} />
              <h2>
                {error ? "Conversation unavailable" : "Opening conversation…"}
              </h2>
              {error && (
                <Link className="quiet-button" to="/messages">
                  Back to inbox
                </Link>
              )}
            </div>
          ) : (
            <>
              <header className="chat-room-header">
                <Link
                  className="mobile-chat-back icon-button"
                  to="/messages"
                  aria-label="Back to inbox"
                >
                  <ArrowLeft size={22} />
                </Link>
                {conversation.kind === "group" ? (
                  <span className="group-avatar">
                    <Users size={22} />
                  </span>
                ) : (
                  conversation.members.find((m) => m.id !== user?.id) && (
                    <Avatar
                      author={conversation.members.find(
                        (m) => m.id !== user?.id,
                      )!}
                      size="small"
                    />
                  )
                )}
                <div className="room-heading">
                  <h2>{label(conversation)}</h2>
                  <span>
                    {typing
                      ? "Typing…"
                      : conversation.kind === "group"
                        ? `${conversation.members.length} members`
                        : online.some((n) => n !== user?.id)
                          ? "Online now"
                          : `@${conversation.members.find((m) => m.id !== user?.id)?.username || ""}`}
                  </span>
                </div>
                <button
                  className="icon-button"
                  aria-label="Search this conversation"
                  title="Search messages"
                  aria-pressed={searchOpen}
                  onClick={() => setSearchOpen((v) => !v)}
                >
                  <Search size={19} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Details"
                  title="Conversation details"
                  onClick={() => setManage(true)}
                >
                  <Info size={20} />
                </button>
              </header>
              {!live.connected && (
                <p className="chat-reconnecting" role="status">
                  Reconnecting… Your conversation will update when the
                  connection returns.
                </p>
              )}
              {searchOpen && (
                <label className="messenger-search conversation-search">
                  <Search size={17} />
                  <input
                    autoFocus
                    aria-label="Search messages"
                    placeholder="Search in this conversation"
                    value={filter}
                    maxLength={100}
                    onChange={(e) => setFilter(e.target.value)}
                  />
                  <button
                    aria-label="Close message search"
                    onClick={() => {
                      setFilter("");
                      setSearchOpen(false);
                    }}
                  >
                    <X size={16} />
                  </button>
                </label>
              )}
              {!conversation.accepted && (
                <div className="chat-request">
                  <div>
                    <strong>
                      {conversation.kind === "group"
                        ? "You're invited"
                        : "A new connection"}
                    </strong>
                    <p>
                      {conversation.kind === "group"
                        ? "Join this group to take part in the conversation."
                        : "Accept this request to reply and share with each other."}
                    </p>
                  </div>
                  <div>
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
                onScroll={() => {
                  const el = timeline.current;
                  if (el)
                    setAwayFromBottom(
                      el.scrollHeight - el.scrollTop - el.clientHeight > 120,
                    );
                }}
                role="log"
                aria-label="Messages"
                aria-live="polite"
              >
                {cursor && (
                  <button
                    className="quiet-button older-messages"
                    disabled={busy}
                    onClick={() => void more()}
                  >
                    Load older messages
                  </button>
                )}
                {messages.map((m, index) => {
                  const previous = messages[index - 1],
                    next = messages[index + 1];
                  const sameDay =
                    previous &&
                    new Date(previous.created_at).toDateString() ===
                      new Date(m.created_at).toDateString();
                  const grouped =
                    !!sameDay &&
                    previous.sender.id === m.sender.id &&
                    new Date(m.created_at).getTime() -
                      new Date(previous.created_at).getTime() <
                      300000;
                  const last =
                    !next ||
                    next.sender.id !== m.sender.id ||
                    new Date(next.created_at).getTime() -
                      new Date(m.created_at).getTime() >=
                      300000;
                  const status = conversation.members.some(
                    (peer) =>
                      peer.id !== user?.id && (peer.last_read_id || 0) >= m.id,
                  )
                    ? "Read"
                    : conversation.members.some(
                          (peer) =>
                            peer.id !== user?.id &&
                            peer.last_delivered_id >= m.id,
                        )
                      ? "Delivered"
                      : "Sent";
                  return (
                    <div key={m.id} data-message-id={m.id}>
                      {m.id === unreadTarget && (
                        <div className="unread-divider">Unread messages</div>
                      )}
                      {!sameDay && (
                        <div className="chat-date">
                          <span>
                            {new Date(m.created_at).toDateString() ===
                            new Date().toDateString()
                              ? "Today"
                              : new Date(m.created_at).toLocaleDateString([], {
                                  weekday: "short",
                                  month: "short",
                                  day: "numeric",
                                })}
                          </span>
                        </div>
                      )}
                      <ChatMessage
                        value={m}
                        own={m.sender.id === user?.id}
                        grouped={grouped}
                        last={last}
                        allowed={allowed}
                        userId={user?.id}
                        status={status}
                        reply={() => {
                          setReply(m);
                          writeDraft(currentDraftKey, { text, reply: m, pin });
                          composer.current?.focus();
                        }}
                        edit={() => {
                          setEditing(m);
                          setEditText(m.text);
                        }}
                        remove={() =>
                          confirmAction(
                            "Delete this message?",
                            "This message will be removed for everyone in the conversation.",
                            "Delete message",
                            () => updateMessage(m, "DELETE"),
                          )
                        }
                        report={() => {
                          setReporting(m);
                          setReportReason("");
                        }}
                        react={(emoji) => void react(m, emoji)}
                      />
                    </div>
                  );
                })}
                {!messages.length && (
                  <div className="timeline-empty">
                    <MessageCircle size={28} />
                    <strong>
                      {filter
                        ? "No matching messages"
                        : "Say hello to " + label(conversation)}
                    </strong>
                    <p>
                      {filter
                        ? "Try a different word or clear your search."
                        : "A little conversation can lead to a big idea."}
                    </p>
                  </div>
                )}
              </div>
              <div className="chat-jump-controls">
                {unreadTarget && (
                  <button
                    className="quiet-button"
                    onClick={() => jumpToMessage(unreadTarget)}
                  >
                    Jump to unread
                  </button>
                )}
                {(awayFromBottom || historyAnchor || filter) && (
                  <button className="secondary-button" onClick={jumpLatest}>
                    <ArrowDown size={15} />
                    Jump to latest
                  </button>
                )}
              </div>
              <form className="chat-composer" onSubmit={send}>
                {pendingAttachment.current && !image && sendKey.current && (
                  <p className="composer-status">
                    Your uploaded photo is ready to retry.
                  </p>
                )}
                {allowed && !canSend && !sendKey.current && (
                  <p className="composer-status">
                    Your request is sent. You can reply once it's accepted.
                  </p>
                )}
                {typing && (
                  <p className="composer-status" role="status">
                    Someone is typing…
                  </p>
                )}
                {reply && (
                  <div className="chat-compose-preview">
                    <span>
                      <strong>
                        Replying to{" "}
                        {reply.sender.display_name || reply.sender.username}
                      </strong>
                      <small>
                        {reply.text.slice(0, 100) || "Shared image or pin"}
                      </small>
                    </span>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label="Remove reply"
                      disabled={busy || !!sendKey.current}
                      onClick={() => {
                        setReply(null);
                        writeDraft(currentDraftKey, { text, reply: null, pin });
                      }}
                    >
                      <X size={17} />
                    </button>
                  </div>
                )}
                {pin && (
                  <div className="chat-compose-preview">
                    <span>
                      <strong>Pin ready to share</strong>
                      <small>Send it with a message, or on its own.</small>
                    </span>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label="Remove pin"
                      disabled={busy || !!sendKey.current}
                      onClick={() => {
                        setPin(null);
                        writeDraft(currentDraftKey, { text, reply, pin: null });
                      }}
                    >
                      <X size={17} />
                    </button>
                  </div>
                )}
                {image && (
                  <div className="chat-compose-preview">
                    {imagePreview && (
                      <img src={imagePreview} alt="Attachment preview" />
                    )}
                    <span>
                      <strong>Photo attached</strong>
                      <small>{image.name}</small>
                    </span>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label="Remove image"
                      disabled={busy || !!sendKey.current}
                      onClick={() => {
                        setImage(null);
                        pendingAttachment.current = null;
                        sendKey.current = null;
                      }}
                    >
                      <X size={17} />
                    </button>
                  </div>
                )}
                <div className="composer-input-row">
                  <label className="composer-attach" title="Attach image">
                    <ImagePlus size={21} />
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
                  <textarea
                    ref={composer}
                    rows={1}
                    aria-label="Message"
                    placeholder={
                      canSend
                        ? "Write a message…"
                        : "Reply when this conversation is accepted"
                    }
                    maxLength={4000}
                    value={text}
                    disabled={!canSend || busy || !!sendKey.current}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        !e.nativeEvent.isComposing &&
                        (text.trim() || image || pin)
                      ) {
                        e.preventDefault();
                        e.currentTarget.form?.requestSubmit();
                      }
                    }}
                    onChange={(e) => {
                      setText(e.target.value);
                      writeDraft(currentDraftKey, {
                        text: e.target.value,
                        reply,
                        pin,
                      });
                      if (!sendKey.current)
                        live.send({
                          type: "typing",
                          conversation_id: Number(id),
                          active: true,
                        });
                    }}
                  />
                  <button
                    className="composer-send"
                    aria-label={
                      busy
                        ? "Sending…"
                        : sendKey.current
                          ? "Retry send"
                          : "Send message"
                    }
                    title={sendKey.current ? "Retry send" : "Send message"}
                    disabled={
                      (!canSend && !sendKey.current) ||
                      busy ||
                      (!text.trim() &&
                        !image &&
                        !pin &&
                        !pendingAttachment.current)
                    }
                  >
                    <Send size={19} />
                    {sendKey.current && <span>Retry</span>}
                  </button>
                </div>
                <div className="composer-hint">
                  <span>Enter to send · Shift + Enter for a new line</span>
                  <span>
                    {text.length > 3500
                      ? `${text.length}/4000`
                      : "Photos & pins welcome"}
                  </span>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
      {newChat && (
        <Modal
          title="New conversation"
          busy={busy}
          close={() => {
            if (!busy) setNewChat(false);
          }}
        >
          <form className="form-stack new-chat-form" onSubmit={create}>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={group}
                onChange={(e) => {
                  setGroup(e.target.checked);
                  setSelectedPeople([]);
                }}
              />
              <span>Group conversation</span>
            </label>
            {group && (
              <label className="field">
                Group name
                <input
                  value={title}
                  maxLength={100}
                  required
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Give your group a name"
                />
              </label>
            )}
            <PeoplePicker
              selected={selectedPeople}
              change={setSelectedPeople}
              multiple={group}
              initialQuery={initialPerson}
            />
            <p className="muted">
              New connections may arrive as a request. Groups can include up to
              20 people.
            </p>
            <ErrorNotice error={error} />
            <button
              className="primary-button"
              disabled={
                busy || !selectedPeople.length || selectedPeople.length > 19
              }
            >
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
      {mediaOpen && id && (
        <Modal title="Shared photos & pins" close={() => setMediaOpen(false)}>
          <SharedMedia conversation={id} jump={jumpToMessage} />
        </Modal>
      )}
      {manage && conversation && (
        <Modal title="Conversation details" close={() => setManage(false)}>
          <div className="form-stack">
            <ErrorNotice error={error} />
            <button
              className="secondary-button"
              onClick={() => {
                setManage(false);
                setMediaOpen(true);
              }}
            >
              <ImagePlus size={17} />
              Shared photos & pins
            </button>
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
                    }).then((ok) => {
                      if (ok) setManage(false);
                    });
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
                    setRenameText(conversation.title);
                    setManage(false);
                    setRenaming(true);
                  }}
                >
                  Rename group
                </button>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act(`${base}members/`, "POST", {
                      username: invitePeople[0]?.username || "",
                    }).then((ok) => {
                      if (ok) setInvitePeople([]);
                    });
                  }}
                >
                  <h3 className="inbox-section-label">Invite someone</h3>
                  <PeoplePicker
                    selected={invitePeople}
                    change={setInvitePeople}
                    multiple={false}
                  />
                  <button
                    className="primary-button"
                    disabled={!invitePeople.length}
                  >
                    Invite
                  </button>
                </form>
              </>
            )}
            {conversation.members.map((m) => (
              <div className="chat-member" key={m.id}>
                <Avatar author={m} size="small" />
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
                          onClick={() => {
                            setManage(false);
                            confirmAction(
                              "Remove this member?",
                              `${m.display_name || m.username} will lose access to this conversation.`,
                              "Remove member",
                              () =>
                                act(`${base}members/`, "DELETE", {
                                  username: m.username,
                                }),
                            );
                          }}
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
                setManage(false);
                confirmAction(
                  "Leave this conversation?",
                  "You will lose access to its history unless someone invites you again.",
                  "Leave conversation",
                  () => act(base, "PATCH", { leave: true }),
                );
              }}
            >
              Leave conversation
            </button>
          </div>
        </Modal>
      )}
      {editing && (
        <Modal
          title="Edit message"
          busy={dialogBusy}
          close={() => setEditing(null)}
        >
          <form
            className="form-stack chat-dialog-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!editText.trim()) return;
              setDialogBusy(true);
              const ok = await updateMessage(editing, "PATCH", {
                text: editText.trim(),
              });
              if (ok) setEditing(null);
              setDialogBusy(false);
            }}
          >
            <label>
              Message
              <textarea
                autoFocus
                value={editText}
                aria-label="Message"
                maxLength={4000}
                onChange={(event) => setEditText(event.target.value)}
              />
            </label>
            <ErrorNotice error={error} />
            <div className="dialog-actions">
              <button
                type="button"
                className="quiet-button"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={dialogBusy || !editText.trim()}
              >
                Save edit
              </button>
            </div>
          </form>
        </Modal>
      )}
      {reporting && (
        <Modal title="Report message" close={() => setReporting(null)}>
          <form className="form-stack chat-dialog-form" onSubmit={submitReport}>
            <p className="muted">
              Tell us what is wrong. The message will stay visible while it is
              reviewed.
            </p>
            <label>
              Reason
              <textarea
                autoFocus
                required
                maxLength={1000}
                value={reportReason}
                placeholder="Describe the problem…"
                onChange={(event) => setReportReason(event.target.value)}
              />
            </label>
            <div className="dialog-actions">
              <button
                type="button"
                className="quiet-button"
                onClick={() => setReporting(null)}
              >
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={!reportReason.trim()}
              >
                Send report
              </button>
            </div>
          </form>
        </Modal>
      )}
      {renaming && (
        <Modal title="Rename group" close={() => setRenaming(false)}>
          <form className="form-stack chat-dialog-form" onSubmit={submitRename}>
            <label>
              Group name
              <input
                autoFocus
                required
                maxLength={100}
                value={renameText}
                onChange={(event) => setRenameText(event.target.value)}
              />
            </label>
            <div className="dialog-actions">
              <button
                type="button"
                className="quiet-button"
                onClick={() => setRenaming(false)}
              >
                Cancel
              </button>
              <button className="primary-button" disabled={!renameText.trim()}>
                Save name
              </button>
            </div>
          </form>
        </Modal>
      )}
      {confirmation && (
        <Modal
          title={confirmation.title}
          busy={dialogBusy}
          close={() => {
            if (!dialogBusy) setConfirmation(null);
          }}
        >
          <div className="chat-dialog-form form-stack">
            <p className="muted">{confirmation.body}</p>
            <ErrorNotice error={error} />
            <div className="dialog-actions">
              <button
                className="quiet-button"
                disabled={dialogBusy}
                onClick={() => setConfirmation(null)}
              >
                Cancel
              </button>
              <button
                className="danger-button"
                disabled={dialogBusy}
                onClick={async () => {
                  setDialogBusy(true);
                  if (await confirmation.run()) setConfirmation(null);
                  setDialogBusy(false);
                }}
              >
                {confirmation.action}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </main>
  );
}
