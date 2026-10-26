import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactNode, FormEvent } from "react";
import { pluralize } from "./format";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Bookmark, Check, Lock, Plus, X } from "lucide-react";
import { ApiError, request } from "./api";
import { useDebouncedValue, usePage } from "./hooks";
import { SearchField, ShareControl, notify } from "./ProductUI";
import { useAuth } from "./auth";
import Owl from "./Owl";
import { celebrateSave, useMasonry } from "./PlayfulMotion";
import LikeButton from "./LikeButton";
import type { Author, Board, Post } from "./types";

export function message(error: unknown) {
  if (error instanceof ApiError && Object.keys(error.fields).length)
    return Object.values(error.fields).flat().join(" ");
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
export function ErrorNotice({ error }: { error: string }) {
  return error ? (
    <p className="form-error" role="alert">
      {error}
    </p>
  ) : null;
}
export function Avatar({
  author,
  size = "",
}: {
  author: Pick<Author, "username" | "display_name" | "avatar">;
  size?: string;
}) {
  return (
    <span className={`avatar ${size}`}>
      {author.avatar ? (
        <img src={author.avatar} alt="" />
      ) : (
        (author.display_name || author.username).slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
export function Modal({
  title,
  close,
  children,
  busy = false,
  className = "",
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  busy?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog.showModal();
    return () => {
      dialog.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const box = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < box.left ||
            event.clientX > box.right ||
            event.clientY < box.top ||
            event.clientY > box.bottom
          )
            if (!busy) close();
        }
      }}
    >
      <div className="modal-heading">
        <h2 id={id}>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={close}
          disabled={busy}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function BoardForm({
  existing,
  done,
}: {
  existing?: Board;
  done: (board: Board) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      done(
        await request<Board>(
          existing ? `/boards/${existing.id}/manage/` : "/boards/",
          existing ? "PATCH" : "POST",
          {
            name: data.get("name"),
            description: data.get("description"),
            is_private: data.has("is_private"),
          },
        ),
      );
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <label className="field">
        Board name
        <input
          name="name"
          required
          maxLength={100}
          defaultValue={existing?.name || ""}
          placeholder="A place for your ideas"
          autoFocus
        />
      </label>
      <label className="field">
        Description
        <textarea
          name="description"
          maxLength={500}
          defaultValue={existing?.description || ""}
          placeholder="What belongs here?"
        />
      </label>
      <label className="checkbox-field">
        <input
          name="is_private"
          type="checkbox"
          defaultChecked={existing?.is_private || false}
        />
        <span>
          Keep this board private
          <small>
            Only you can see the board and its collection. Posts remain public.
          </small>
        </span>
        <Lock size={16} />
      </label>
      <ErrorNotice error={error} />
      <button className="primary-button" disabled={busy}>
        {busy ? "Saving…" : existing ? "Save board" : "Create board"}
        <ArrowRight size={17} />
      </button>
    </form>
  );
}
export function SaveDialog({ post, close }: { post: Post; close: () => void }) {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const settled = useDebouncedValue(query);
  const page = usePage<Board>(`/boards/?q=${encodeURIComponent(settled)}`);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [saved, setSaved] = useState<Board | null>(null);
  const [error, setError] = useState("");
  async function save(board: Board) {
    setBusy(board.id);
    setError("");
    try {
      await request(`/boards/${board.id}/saves/`, "POST", { post_id: post.id });
      try {
        sessionStorage.setItem(
          `behtrest-save-board:${user?.id}`,
          String(board.id),
        );
      } catch {
        /* Saving does not depend on browser storage. */
      }
      celebrateSave(post);
      setSaved(board);
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(null);
    }
  }
  return (
    <Modal
      title={
        creating
          ? "Create a board"
          : saved
            ? "A good idea, kept."
            : "Save to a board"
      }
      close={close}
      busy={busy !== null}
    >
      {saved ? (
        <div className="saved-state">
          <Check size={32} />
          <p>
            Saved to <strong>{saved.name}</strong>.
          </p>
          <Link
            className="primary-button"
            to={`/boards/${saved.id}`}
            onClick={close}
          >
            View board <ArrowRight size={17} />
          </Link>
        </div>
      ) : creating ? (
        <>
          <BoardForm
            done={(board) => {
              setCreating(false);
              void save(board);
            }}
          />
          <button className="quiet-button" onClick={() => setCreating(false)}>
            Back to boards
          </button>
        </>
      ) : (
        <>
          <div className="save-preview">
            <img src={post.thumbnail} alt="" />
            <span>{post.title}</span>
          </div>
          <ErrorNotice error={error || page.error} />
          <SearchField
            value={query}
            change={setQuery}
            label="Find a board"
            placeholder="Search your boards"
          />
          <div className="board-options">
            {page.items.map((board) => (
              <button
                className="board-option"
                key={board.id}
                onClick={() => void save(board)}
                disabled={busy !== null}
              >
                <span>
                  {board.cover ? (
                    <img src={board.cover} alt="" />
                  ) : (
                    <Bookmark size={18} />
                  )}
                </span>
                <strong>{board.name}</strong>
                {board.is_private && <Lock size={14} />}
                <small>
                  {busy === board.id
                    ? "Saving…"
                    : pluralize(board.post_count, "pin")}
                </small>
              </button>
            ))}
          </div>
          {!page.loading && !page.error && !page.items.length && (
            <p className="muted save-empty">
              {query
                ? "No boards match that search."
                : "Create a board to keep this pin."}
            </p>
          )}
          {page.loading && (
            <p className="muted" role="status">
              Loading boards…
            </p>
          )}
          {page.cursor && (
            <button
              className="quiet-button"
              onClick={() => void page.loadMore()}
              disabled={page.loading}
            >
              More boards
            </button>
          )}
          {page.error && !page.cursor && (
            <button className="quiet-button" onClick={page.reload}>
              Try again
            </button>
          )}
          <button
            className="secondary-button full-width"
            onClick={() => setCreating(true)}
          >
            <Plus size={17} />
            Create a new board
          </button>
        </>
      )}
    </Modal>
  );
}
function PinImage({ post }: { post: Post }) {
  const ref = useRef<HTMLImageElement>(null);
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  useEffect(() => {
    setState(
      ref.current?.complete && ref.current.naturalWidth ? "loaded" : "loading",
    );
  }, [post.thumbnail]);
  return (
    <span className={`pin-media ${state}`}>
      {state === "loading" && (
        <span className="image-skeleton" aria-hidden="true" />
      )}
      <img
        ref={ref}
        src={post.thumbnail}
        alt={post.alt_text || post.title}
        width={post.width}
        height={post.height}
        loading="lazy"
        style={{ aspectRatio: `${post.width}/${post.height}` }}
        onLoad={() => setState("loaded")}
        onError={() => setState("error")}
      />
      {state === "error" && (
        <span className="image-unavailable">Image unavailable</span>
      )}
    </span>
  );
}

export function PostGrid({
  endpoint,
  empty = "No pins here yet.",
  action,
  emptyDescription = "Good collections start with a little curiosity.",
  emptyAction,
  feedFirst = false,
}: {
  endpoint: string;
  empty?: string;
  action?: (post: Post) => ReactNode;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  feedFirst?: boolean;
}) {
  const page = usePage<Post>(endpoint, feedFirst);
  const [saving, setSaving] = useState<Post | null>(null);
  const [hidden, setHidden] = useState<number[]>([]);
  useEffect(() => {
    const hide = (event: Event) => {
      if (event instanceof CustomEvent)
        setHidden((values) => [...values, event.detail]);
    };
    window.addEventListener("pin-hidden", hide);
    return () => window.removeEventListener("pin-hidden", hide);
  }, []);
  const sentinel = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const visibleItems = useMemo(
    () => page.items.filter((post) => !hidden.includes(post.id)),
    [page.items, hidden],
  );
  const longFeed = useMasonry(grid, visibleItems, feedFirst);
  const navigate = useNavigate();
  const location = useLocation();
  const pinState = (post: Post) => ({
    ...(location.pathname.startsWith("/pin/")
      ? location.state?.backgroundLocation
        ? {
            backgroundLocation: location.state.backgroundLocation,
            pinDepth: (location.state.pinDepth || 1) + 1,
            feedScroll: location.state.feedScroll,
          }
        : {}
      : feedFirst
        ? {
            backgroundLocation: location,
            pinDepth: 1,
            feedScroll: window.scrollY,
          }
        : {}),
    pinPreview: {
      width: post.width,
      height: post.height,
      image: post.thumbnail,
    },
    pinClick: true,
  });
  const { user } = useAuth();
  const pendingClick = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quickSaves = useRef(new Set<number>());
  useEffect(
    () => () => {
      if (pendingClick.current) clearTimeout(pendingClick.current);
    },
    [],
  );
  async function quickSave(post: Post) {
    if (quickSaves.current.has(post.id)) return;
    quickSaves.current.add(post.id);
    try {
      const boards = await request<{ items: Board[] }>("/boards/");
      let previous = "";
      try {
        previous =
          sessionStorage.getItem(`behtrest-save-board:${user?.id}`) || "";
      } catch {
        /* Use the first current board. */
      }
      const board =
        boards.items.find((item) => String(item.id) === previous) ||
        boards.items[0];
      if (!board) {
        setSaving(post);
        return;
      }
      await request(`/boards/${board.id}/saves/`, "POST", { post_id: post.id });
      celebrateSave(post, true);
      notify(`Saved to ${board.name}`);
    } catch (error) {
      notify(message(error));
    } finally {
      quickSaves.current.delete(post.id);
    }
  }
  useEffect(() => {
    if (!page.cursor || page.loading || page.error) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) void page.loadMore();
      },
      { rootMargin: "250px" },
    );
    if (sentinel.current) observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [page.cursor, page.loading, page.error, page.loadMore]);
  return (
    <>
      <div className="pin-grid" ref={grid} aria-busy={page.loading}>
        {visibleItems.map((post, index) => (
          <article
            className={`pin-card ${feedFirst ? "feed-pin" : ""}`}
            key={post.id}
            data-pin-id={post.id}
            style={
              feedFirst
                ? { animationDelay: `${(index % 8) * 20}ms` }
                : undefined
            }
            tabIndex={feedFirst ? 0 : undefined}
            aria-label={feedFirst ? post.title : undefined}
          >
            <div className="pin-image">
              <Link
                className="pin-open"
                to={`/pin/${post.id}`}
                state={pinState(post)}
                onClick={(event) => {
                  if (
                    !feedFirst ||
                    event.ctrlKey ||
                    event.metaKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return;
                  event.preventDefault();
                  const state = pinState(post);
                  if (pendingClick.current) clearTimeout(pendingClick.current);
                  if (event.detail === 0)
                    navigate(`/pin/${post.id}`, { state });
                  if (event.detail === 1)
                    pendingClick.current = setTimeout(
                      () =>
                        navigate(`/pin/${post.id}`, {
                          state,
                        }),
                      300,
                    );
                }}
                onDoubleClick={(event) => {
                  if (!feedFirst) return;
                  event.preventDefault();
                  if (pendingClick.current) clearTimeout(pendingClick.current);
                  void quickSave(post);
                }}
              >
                <PinImage post={post} />
                {!feedFirst && (
                  <span className="pin-hover-copy">
                    <strong>{post.title}</strong>
                    <span>
                      {post.owner.display_name || post.owner.username}
                    </span>
                  </span>
                )}
              </Link>
              {feedFirst && (
                <>
                  <LikeButton post={post} compact />
                  <div className="pin-hover-copy">
                    <Link
                      className="pin-overlay-title"
                      onClick={(event) => {
                        if (
                          !event.ctrlKey &&
                          !event.metaKey &&
                          !event.shiftKey &&
                          !event.altKey
                        ) {
                          event.preventDefault();
                          navigate(`/pin/${post.id}`, {
                            state: pinState(post),
                          });
                        }
                      }}
                      to={`/pin/${post.id}`}
                      state={pinState(post)}
                    >
                      {post.title}
                    </Link>
                    <Link
                      className="pin-overlay-author"
                      to={`/u/${encodeURIComponent(post.owner.username)}`}
                    >
                      <Avatar author={post.owner} size="tiny" />
                      <span>
                        {post.owner.display_name || post.owner.username}
                      </span>
                    </Link>
                  </div>
                  <ShareControl
                    compact
                    title={post.title}
                    path={`/pin/${post.id}`}
                    chat={`/messages?pin=${post.id}`}
                  />
                </>
              )}
              <button
                className="pin-save"
                onClick={() => setSaving(post)}
                aria-label={`Save ${post.title}`}
                disabled={
                  !!post.moderation_status &&
                  post.moderation_status !== "approved"
                }
              >
                <Bookmark size={15} />
                Save
              </button>
            </div>
            {!feedFirst && (
              <div className="pin-card-content">
                <Link
                  className="pin-title"
                  to={`/pin/${post.id}`}
                  state={pinState(post)}
                >
                  {post.title}
                </Link>
                {post.moderation_status &&
                  post.moderation_status !== "approved" && (
                    <small className="muted">
                      {post.moderation_status === "rejected"
                        ? "Image blocked"
                        : post.moderation_status === "review"
                          ? "Awaiting review"
                          : "Processing image"}{" "}
                      · Only you
                    </small>
                  )}
                <div className="pin-owner">
                  <Link to={`/u/${encodeURIComponent(post.owner.username)}`}>
                    <Avatar author={post.owner} size="tiny" />
                    <span>
                      {post.owner.display_name || post.owner.username}
                    </span>
                  </Link>
                  {action?.(post)}
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
      {page.loading && (
        <div className="feed-status" role="status">
          {feedFirst && <Owl state="think" />}
          {page.items.length
            ? "Finding a little more…"
            : "Gathering inspiration…"}
        </div>
      )}
      <ErrorNotice error={page.error} />
      {page.error && (
        <button
          className="secondary-button"
          onClick={() => (page.cursor ? void page.loadMore() : page.reload())}
        >
          Try again
        </button>
      )}
      {!page.loading && !page.error && !page.items.length && (
        <div className="empty-state">
          {feedFirst ? <Owl state="sleep" /> : <Bookmark size={32} />}
          <h2>{feedFirst ? "Nothing more tonight. Stay curious." : empty}</h2>
          <p>{emptyDescription}</p>
          {emptyAction || (
            <Link className="text-link" to="/create">
              Share your first pin <ArrowRight size={16} />
            </Link>
          )}
        </div>
      )}
      <div ref={sentinel} className="feed-status">
        {page.cursor && !page.loading && !page.error ? (
          <button
            className="secondary-button"
            onClick={() => void page.loadMore()}
          >
            Load more inspiration
          </button>
        ) : !page.loading &&
          !page.error &&
          page.items.length > 0 &&
          (!feedFirst || longFeed) ? (
          feedFirst ? (
            <div className="owl-end">
              <Owl state="sleep" />
              <span>Nothing more tonight. Stay curious.</span>
            </div>
          ) : (
            <span>You’ve seen everything here. Stay curious.</span>
          )
        ) : null}
      </div>
      {saving && <SaveDialog post={saving} close={() => setSaving(null)} />}
    </>
  );
}
export function BoardCard({ board }: { board: Board }) {
  return (
    <Link className="board-card" to={`/boards/${board.id}`}>
      <div className="board-cover">
        {board.cover ? (
          <img src={board.cover} alt="" loading="lazy" />
        ) : (
          <Bookmark size={34} />
        )}{" "}
        {board.is_private && (
          <span className="private-badge">
            <Lock size={13} />
            Private
          </span>
        )}
      </div>
      <h3>{board.name}</h3>
      <p>{pluralize(board.post_count, "pin")}</p>
    </Link>
  );
}
