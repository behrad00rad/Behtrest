import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import {
  Bookmark,
  ChevronDown,
  Copy,
  Heart,
  MessageCircle,
  Share2,
} from "lucide-react";
import { request } from "./api";
import { useAuth } from "./auth";
import { usePage, useResource } from "./hooks";
import { BoardForm, ErrorNotice, message } from "./components";
import { notify } from "./ProductUI";
import { celebrateSave } from "./PlayfulMotion";
import type { Author, Board, Comment, Post, Profile } from "./types";

export function ActionPopover({
  label,
  trigger,
  children,
  open,
  change,
  className = "",
}: {
  label: string;
  trigger: ReactNode;
  children: ReactNode;
  open: boolean;
  change: (open: boolean) => void;
  className?: string;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null),
    panel = useRef<HTMLDivElement>(null),
    button = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, maxHeight: 480 });
  const close = () => {
    change(false);
    button.current?.focus({ preventScroll: true });
  };
  useLayoutEffect(() => {
    if (!open || !panel.current || !button.current) return;
    const place = () => {
      const anchor = button.current!.getBoundingClientRect(),
        box = panel.current!.getBoundingClientRect();
      const desiredHeight = Math.min(480, panel.current!.scrollHeight + 2);
      const below = Math.max(0, innerHeight - anchor.bottom - 16);
      const above = Math.max(0, anchor.top - 16);
      const flip = below < desiredHeight && above > below;
      const maxHeight = Math.max(44, Math.min(480, flip ? above : below));
      const height = Math.min(desiredHeight, maxHeight);
      const next = {
        top: Math.max(8, flip ? anchor.top - height - 8 : anchor.bottom + 8),
        left: Math.max(
          8,
          Math.min(anchor.right - box.width, innerWidth - box.width - 8),
        ),
        maxHeight,
      };
      setPosition((previous) =>
        previous.top === next.top &&
        previous.left === next.left &&
        previous.maxHeight === next.maxHeight
          ? previous
          : next,
      );
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(panel.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    panel.current
      .querySelector<HTMLElement>("a[href], button:not(:disabled), input")
      ?.focus({ preventScroll: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        change(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, change]);
  function keyboard(event: KeyboardEvent) {
    if (
      event.target instanceof Element &&
      event.target.closest("dialog") !== root.current?.closest("dialog")
    )
      return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (!["Tab", "ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
      return;
    if (
      event.target instanceof HTMLElement &&
      event.target.matches("input, textarea, select") &&
      event.key !== "Tab"
    )
      return;
    const items = [
      ...panel.current!.querySelectorAll<HTMLElement>(
        "a[href],button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled)",
      ),
    ];
    if (!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    event.preventDefault();
    event.stopPropagation();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (index +
              (event.key === "ArrowUp" || event.shiftKey ? -1 : 1) +
              items.length) %
            items.length;
    items[next]?.focus();
  }
  return (
    <div ref={root} className={`pin-popover ${className}`}>
      <button
        ref={button}
        type="button"
        className="icon-button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-haspopup="dialog"
        onClick={() => change(!open)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            change(true);
          }
        }}
      >
        {trigger}
      </button>
      {open && (
        <div
          id={id}
          ref={panel}
          className="pin-popover-panel"
          role="dialog"
          aria-label={label}
          style={position}
          onKeyDown={keyboard}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function PinSaveControl({ post }: { post: Post }) {
  const { user } = useAuth();
  const boards = usePage<Board>("/boards/?page_size=36");
  const [open, setOpen] = useState(false),
    [creating, setCreating] = useState(false),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [last, setLast] = useState(() => {
    try {
      return sessionStorage.getItem(`behtrest-save-board:${user?.id}`) || "";
    } catch {
      return "";
    }
  });
  const [previous, setPrevious] = useState<Board | null>(null);
  useEffect(() => {
    if (!last || boards.items.some((board) => String(board.id) === last))
      return;
    let active = true;
    void request<Board>(`/boards/${encodeURIComponent(last)}/`)
      .then((board) => {
        if (active && board.owner === user?.username) setPrevious(board);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [last, boards.items, user?.username]);
  const options = [...boards.items];
  if (previous && !options.some((board) => board.id === previous.id))
    options.push(previous);
  options.sort(
    (a, b) => Number(String(b.id) === last) - Number(String(a.id) === last),
  );
  async function save(board: Board) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await request<{ created: boolean }>(
        `/boards/${board.id}/saves/`,
        "POST",
        { post_id: post.id },
      );
      setLast(String(board.id));
      try {
        sessionStorage.setItem(
          `behtrest-save-board:${user?.id}`,
          String(board.id),
        );
      } catch {
        /* Saving works without storage. */
      }
      setOpen(false);
      setCreating(false);
      celebrateSave(post);
      notify({
        message: `${result.created ? "Saved" : "Already saved"} to ${board.name}`,
        actions: [
          { label: "Change", onClick: () => setOpen(true) },
          ...(result.created
            ? [
                {
                  label: "Undo",
                  onClick: () => {
                    void request(
                      `/boards/${board.id}/saves/${post.id}/`,
                      "DELETE",
                      {},
                    )
                      .then(() => notify("Save undone"))
                      .catch((error) => notify(message(error)));
                  },
                },
              ]
            : []),
        ],
      });
    } catch (error) {
      setError(message(error));
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }
  const disabled =
    busy || (!!post.moderation_status && post.moderation_status !== "approved");
  return (
    <div className="pin-save-control">
      <button
        className="primary-button pin-save-primary"
        aria-label="Save pin"
        disabled={disabled}
        onClick={() => (options.length ? void save(options[0]) : setOpen(true))}
      >
        <Bookmark size={17} />
        <span>Save</span>
      </button>
      <ActionPopover
        className="board-picker"
        label="Choose board"
        trigger={<ChevronDown size={18} />}
        open={open}
        change={setOpen}
      >
        <strong>Save to a board</strong>
        <ErrorNotice error={error || boards.error} />
        {creating ? (
          <>
            <BoardForm
              done={(board) => {
                boards.setItems((items) => [board, ...items]);
                void save(board);
              }}
            />
            <button onClick={() => setCreating(false)}>Back to boards</button>
          </>
        ) : (
          <>
            {options.map((board) => (
              <button
                key={board.id}
                disabled={disabled}
                onClick={() => void save(board)}
              >
                {board.name}
                {String(board.id) === last && <small>Last used</small>}
              </button>
            ))}
            {boards.loading && <p role="status">Loading boards...</p>}
            {boards.cursor && (
              <button
                disabled={boards.loading}
                onClick={() => void boards.loadMore()}
              >
                More boards
              </button>
            )}
            {boards.error && <button onClick={boards.reload}>Try again</button>}
            <button onClick={() => setCreating(true)}>Create board</button>
          </>
        )}
      </ActionPopover>
    </div>
  );
}

export function PinShareControl({ post }: { post: Post }) {
  const [open, setOpen] = useState(false),
    [fallback, setFallback] = useState(false);
  const url = new URL(`/pin/${post.id}`, location.origin).href;
  const native =
    typeof navigator.share === "function" &&
    matchMedia("(max-width: 767px)").matches;
  return (
    <ActionPopover
      label="Share pin"
      trigger={<Share2 size={18} />}
      open={open}
      change={setOpen}
    >
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setOpen(false);
            notify("Link copied");
          } catch {
            setFallback(true);
          }
        }}
      >
        <Copy size={17} />
        Copy link
      </button>
      {native && (
        <button
          onClick={async () => {
            try {
              await navigator.share({ title: post.title, url });
              setOpen(false);
            } catch (error) {
              if (!(
                error instanceof DOMException && error.name === "AbortError"
              ))
                notify(message(error));
            }
          }}
        >
          <Share2 size={17} />
          Share...
        </button>
      )}
      <Link to={`/messages?pin=${post.id}`} onClick={() => setOpen(false)}>
        <MessageCircle size={17} />
        Send in message
      </Link>
      {fallback && (
        <label>
          Copy this link
          <input
            aria-label="Share link"
            readOnly
            value={url}
            onFocus={(e) => e.target.select()}
          />
        </label>
      )}
    </ActionPopover>
  );
}

export function PinFollow({ author }: { author: Author }) {
  const profile = useResource<Profile>(
    `/profiles/${encodeURIComponent(author.username)}/`,
  );
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="secondary-button pin-follow"
      disabled={busy || !profile.data}
      aria-pressed={profile.data?.is_following || false}
      onClick={async () => {
        setBusy(true);
        try {
          await request(
            `/profiles/${encodeURIComponent(author.username)}/follow/`,
            profile.data?.is_following ? "DELETE" : "POST",
            {},
          );
          profile.setData((value) =>
            value ? { ...value, is_following: !value.is_following } : value,
          );
        } catch (error) {
          notify(message(error));
        } finally {
          setBusy(false);
        }
      }}
    >
      {profile.data?.is_following ? "Following" : "Follow"}
    </button>
  );
}

export function CommentLikeButton({
  comment,
  change,
}: {
  comment: Comment;
  change: (comment: Comment) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="comment-like"
      aria-label="Like comment"
      aria-pressed={!!comment.liked}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const result = await request<{ liked: boolean; like_count: number }>(
            `/comments/${comment.id}/likes/`,
            comment.liked ? "DELETE" : "POST",
            {},
          );
          change({ ...comment, ...result });
        } catch (error) {
          notify(message(error));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Heart size={14} fill={comment.liked ? "currentColor" : "none"} />
      {comment.like_count || 0}
    </button>
  );
}

export function PinMetadata({ post }: { post: Post }) {
  useEffect(() => {
    const title = document.title;
    document.title = `${post.title} | Behtrest`;
    const description = post.description
      .split("\nPhoto:")[0]
      .trim()
      .slice(0, 300);
    const entries: [string, string, string][] = [
      ["property", "og:type", "article"],
      ["property", "og:site_name", "Behtrest"],
      ["property", "og:title", post.title],
      ["property", "og:description", description],
      ["property", "og:image", new URL(post.image, location.origin).href],
      ["property", "og:image:alt", post.alt_text || post.title],
      ["property", "og:url", new URL(`/pin/${post.id}`, location.origin).href],
      ["name", "twitter:card", "summary_large_image"],
      ["name", "twitter:title", post.title],
      ["name", "twitter:description", description],
      ["name", "twitter:image", new URL(post.image, location.origin).href],
      ["name", "twitter:image:alt", post.alt_text || post.title],
    ];
    const restore = entries.map(([attribute, key, value]) => {
      const existing = document.head.querySelector<HTMLMetaElement>(
        `meta[${attribute}="${key}"]`,
      );
      const el = existing || document.createElement("meta");
      const previous = el.content;
      el.setAttribute(attribute, key);
      el.content = value;
      if (!existing) document.head.append(el);
      return () => {
        if (existing) el.content = previous;
        else el.remove();
      };
    });
    return () => {
      document.title = title;
      restore.forEach((fn) => fn());
    };
  }, [post]);
  return null;
}
