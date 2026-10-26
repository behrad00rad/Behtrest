import { useEffect, useId, useRef, useState } from "react";
import { ImageCheck } from "./ImageCheck";
import type { FormEvent } from "react";
import {
  Link,
  useNavigate,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  Pencil,
  Trash2,
  Upload,
  MoreHorizontal,
  Maximize2,
  Search as SearchIcon,
  X,
} from "lucide-react";
import { request, upload } from "./api";
import { useAuth } from "./auth";
import { usePage, useResource } from "./hooks";
import { SearchField, ShareControl, notify } from "./ProductUI";
import { ApiError } from "./api";
import DiscoverTags from "./DiscoverTags";
import Owl from "./Owl";
import LikeButton from "./LikeButton";
import { recordPinEvent } from "./pinEvents";
import { ReportButton } from "./Community";
import type { Author, Comment, Post } from "./types";
import {
  Avatar,
  ErrorNotice,
  message,
  Modal,
  PostGrid,
  SaveDialog,
} from "./components";

export function Explore() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tag = params.get("tag") || "";
  const following = params.get("feed") === "following";
  const tags = useResource<{ items: string[] }>("/tags/");
  const accessoryIndex = useRef(0);
  useEffect(() => {
    const accessories = ["none", "mug", "backpack", "lamp"];
    window.dispatchEvent(
      new CustomEvent("owl-accessory", {
        detail: accessories[accessoryIndex.current++ % accessories.length],
      }),
    );
  }, [tag]);
  return (
    <main className="collection-page explore-page">
      <h1 className="sr-only">Discover inspiration</h1>
      <div className="discover-toolbar">
        <div className="tabs feed-tabs">
          <button
            className={!following ? "active" : ""}
            aria-pressed={!following}
            onClick={() => setParams(tag ? { tag } : {})}
          >
            Discover
          </button>
          <button
            className={following ? "active" : ""}
            aria-pressed={following}
            onClick={() =>
              setParams({ ...(tag ? { tag } : {}), feed: "following" })
            }
          >
            Following
          </button>
        </div>
        <DiscoverTags
          items={tags.data?.items || []}
          interests={user?.profile.interests || []}
          selected={tag}
          change={(value) =>
            setParams({
              ...(value ? { tag: value } : {}),
              ...(following ? { feed: "following" } : {}),
            })
          }
        />
      </div>
      <PostGrid
        feedFirst
        endpoint={`/feed/?following=${following ? 1 : 0}${tag ? `&tag=${encodeURIComponent(tag)}` : `&preferences=${encodeURIComponent((user?.profile.interests || []).join(","))}`}`}
        empty={
          following
            ? "Your following feed is quiet"
            : tag
              ? "No pins with this tag yet."
              : "The first idea is yours."
        }
        emptyDescription={
          following
            ? "Follow people from their profiles to see their pins here."
            : undefined
        }
        emptyAction={
          following ? (
            <Link className="secondary-button" to="/search?kind=people">
              Find people
            </Link>
          ) : undefined
        }
      />
    </main>
  );
}

export function Search() {
  const [params, setParams] = useSearchParams();
  const query = params.get("q") || "";
  const kind = params.get("kind") === "people" ? "people" : "posts";
  const tag = params.get("tag") || "";
  const sort = params.get("sort") === "oldest" ? "oldest" : "newest";
  const [input, setInput] = useState(query);
  const tags = useResource<{ items: string[] }>("/tags/");
  useEffect(() => setInput(query), [query]);
  function update(values: Record<string, string>) {
    setParams({
      ...(query ? { q: query } : {}),
      kind,
      ...(tag ? { tag } : {}),
      sort,
      ...values,
    });
  }
  return (
    <main className="collection-page product-page search-page">
      <div className="page-heading">
        <div>
          <h1>Search</h1>
          <p>
            {query
              ? `Results for “${query}”`
              : tag
                ? `Explore #${tag}`
                : "Find pins and people. Follow an idea."}
          </p>
        </div>
      </div>
      <form
        className="search-page-form"
        role="search"
        aria-label="Search page"
        onSubmit={(e) => {
          e.preventDefault();
          setParams({
            ...(input.trim() ? { q: input.trim() } : {}),
            kind,
            ...(tag ? { tag } : {}),
            sort,
          });
        }}
      >
        <SearchField
          value={input}
          change={setInput}
          label="Search query"
          placeholder="Search ideas, tags, or people"
        />
        <button className="primary-button" aria-label="Run search">
          <SearchIcon size={18} />
          Search
        </button>
      </form>
      <div className="product-toolbar search-filters">
        <div className="tabs">
          <button
            className={kind === "posts" ? "active" : ""}
            aria-pressed={kind === "posts"}
            onClick={() => update({ kind: "posts" })}
          >
            Pins
          </button>
          <button
            className={kind === "people" ? "active" : ""}
            aria-pressed={kind === "people"}
            onClick={() =>
              setParams({ ...(query ? { q: query } : {}), kind: "people" })
            }
          >
            People
          </button>
        </div>
        {kind === "posts" && (
          <div className="toolbar-filters">
            <label>
              Tag
              <select
                aria-label="Filter search by tag"
                value={tag}
                onChange={(e) => update({ tag: e.target.value })}
              >
                <option value="">All tags</option>
                {tags.data?.items.map((item) => (
                  <option key={item} value={item}>
                    {item.replaceAll("-", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sort
              <select
                aria-label="Sort search results"
                value={sort}
                onChange={(e) => update({ sort: e.target.value })}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </label>
          </div>
        )}
      </div>
      {tag && (
        <div className="active-filter">
          <span>Filtered by #{tag}</span>
          <button
            className="quiet-button"
            onClick={() =>
              setParams({ ...(query ? { q: query } : {}), kind, sort })
            }
          >
            <X size={14} />
            Clear filter
          </button>
        </div>
      )}
      {query || (kind === "posts" && tag) ? (
        kind === "posts" ? (
          <PostGrid
            endpoint={`/feed/?q=${encodeURIComponent(query)}&sort=${sort}${tag ? `&tag=${encodeURIComponent(tag)}` : ""}`}
            empty="No matching pins. Try another idea."
            emptyDescription="Try fewer words, another tag, or clear the filters."
            emptyAction={
              <Link className="secondary-button" to="/">
                Explore all pins
              </Link>
            }
          />
        ) : (
          <People query={query.replace(/^@/, "")} />
        )
      ) : (
        <section className="search-discovery">
          <SearchIcon size={30} />
          <h2>Where will your curiosity take you?</h2>
          <p>Try a name, a color, or something you love.</p>
          <div className="discovery-tags">
            {tags.data?.items.slice(0, 16).map((item) => (
              <Link
                key={item}
                to={`/search?kind=posts&tag=${encodeURIComponent(item)}`}
              >
                #{item.replaceAll("-", " ")}
              </Link>
            ))}
          </div>
          <ErrorNotice error={tags.error} />
          <Link className="text-link" to="/">
            Browse all pins <ArrowRight size={16} />
          </Link>
        </section>
      )}
    </main>
  );
}
function People({ query }: { query: string }) {
  const page = usePage<Author>(`/people/?q=${encodeURIComponent(query)}`);
  const { user } = useAuth();
  return (
    <>
      <div className="people-grid">
        {page.items.map((author) => (
          <article className="person-card" key={author.id}>
            <Link
              className="person-profile"
              to={`/u/${encodeURIComponent(author.username)}`}
              key={author.id}
            >
              <Avatar author={author} />
              <h2>{author.display_name || author.username}</h2>
              <p>@{author.username}</p>
            </Link>
            {user?.id !== author.id && (
              <Link
                className="secondary-button"
                to={`/messages?to=${encodeURIComponent(author.username)}`}
              >
                Message
              </Link>
            )}
          </article>
        ))}
      </div>
      <ErrorNotice error={page.error} />
      {page.loading && <p role="status">Looking for people…</p>}
      {!page.loading && !page.error && !page.items.length && (
        <div className="empty-state">
          <h2>No one by that name yet.</h2>
          <p>Try another username or display name.</p>
        </div>
      )}
      {page.cursor && (
        <button
          className="secondary-button"
          onClick={() => void page.loadMore()}
          disabled={page.loading}
        >
          More people
        </button>
      )}
      {page.error && (
        <button
          className="secondary-button"
          onClick={() => (page.cursor ? void page.loadMore() : page.reload())}
        >
          Try again
        </button>
      )}
    </>
  );
}

export function PostFields({
  post,
  errors = {},
}: {
  post?: Post;
  errors?: Record<string, string[]>;
}) {
  const id = useId();
  const feedback = (name: string) =>
    errors[name] && (
      <span id={`${id}-${name}`} className="field-error">
        {errors[name].join(" ")}
      </span>
    );
  const validation = (name: string) => ({
    "aria-invalid": Boolean(errors[name]),
    "aria-describedby": errors[name] ? `${id}-${name}` : undefined,
  });
  return (
    <>
      <label className="field">
        Title
        <input
          name="title"
          {...validation("title")}
          required
          maxLength={200}
          defaultValue={post?.title || ""}
          placeholder="Give your idea a name"
        />
        {feedback("title")}
      </label>
      <label className="field">
        Description
        <textarea
          name="description"
          {...validation("description")}
          maxLength={5000}
          defaultValue={post?.description || ""}
          placeholder="What caught your eye?"
          rows={4}
        />
        {feedback("description")}
      </label>
      <label className="field">
        Tags
        <input
          name="tags"
          {...validation("tags")}
          maxLength={400}
          defaultValue={post?.tags.join(", ") || ""}
          placeholder="blue, architecture, nature"
        />
        <small>Up to 8 tags, separated by commas.</small>
        {feedback("tags")}
      </label>
      <label className="field">
        Source link <span className="optional">optional</span>
        <input
          name="source_url"
          {...validation("source_url")}
          type="url"
          maxLength={500}
          defaultValue={post?.source_url || ""}
          placeholder="https://…"
        />
        {feedback("source_url")}
      </label>
      <label className="field">
        Alt text <span className="optional">recommended</span>
        <input
          name="alt_text"
          {...validation("alt_text")}
          maxLength={500}
          defaultValue={post?.alt_text || ""}
          placeholder="Describe the image for someone who can’t see it"
        />
        <small>
          A short description helps people using screen readers enjoy your pin.
        </small>
        {feedback("alt_text")}
      </label>
    </>
  );
}

export function CreatePost() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const navigate = useNavigate();
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => () => controller.current?.abort(), []);
  function choose(candidate: File | undefined) {
    setError("");
    setFieldErrors({});
    if (!candidate) return;
    if (candidate.size > 8 * 1024 * 1024) {
      setError("Choose an image smaller than 8 MB.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(candidate.type)) {
      setError("Choose a JPG, PNG, or WebP image.");
      return;
    }
    setFile(candidate);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!file) {
      setError("Choose an image first.");
      return;
    }
    const body = new FormData(event.currentTarget);
    body.set("image", file);
    setBusy(true);
    setProgress(0);
    setError("");
    setFieldErrors({});
    controller.current = new AbortController();
    try {
      const post = await upload<Post>(
        "/posts/",
        body,
        setProgress,
        controller.current.signal,
      );
      notify(
        post.moderation_status && post.moderation_status !== "approved"
          ? "Pin uploaded. Image review is pending."
          : "Your pin was published.",
      );
      navigate(`/posts/${post.id}`);
    } catch (error) {
      if (!controller.current.signal.aborted) {
        setError(message(error));
        if (error instanceof ApiError)
          setFieldErrors(
            Object.keys(error.fields).length
              ? error.fields
              : error.code === "invalid_tags"
                ? { tags: [error.message] }
                : {},
          );
      }
    } finally {
      if (!controller.current.signal.aborted) setBusy(false);
    }
  }
  return (
    <main className="collection-page narrow-page">
      <Link className="back-link" to="/">
        <ArrowLeft size={16} />
        Back to inspiration
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PUT SOMETHING GOOD INTO THE WORLD</span>
          <h1>
            Share a little <em>inspiration.</em>
          </h1>
        </div>
      </div>
      <form
        className={`create-layout ${file ? "has-file" : "choose-image"}`}
        onSubmit={submit}
      >
        <div>
          <label
            className={`upload-zone ${file ? "has-image" : ""} ${dragging ? "drag-over" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              if (!busy) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              if (!busy) choose(event.dataTransfer.files[0]);
            }}
          >
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Choose pin image"
              disabled={busy}
              onChange={(event) => choose(event.target.files?.[0])}
            />
            {preview ? (
              <img src={preview} alt="Preview of your selected image" />
            ) : (
              <>
                <Upload size={32} />
                <strong>Drop an image here</strong>
                <span>or click to choose a file</span>
                <small>JPG, PNG, WebP · up to 8 MB</small>
              </>
            )}
          </label>
          {file && (
            <div className="selected-file">
              <span>{file.name}</span>
              <button
                className="quiet-button"
                type="button"
                disabled={busy}
                onClick={() => setFile(null)}
              >
                Remove
              </button>
            </div>
          )}
          {!file && <ErrorNotice error={error} />}
        </div>
        {file && (
          <div>
            <PostFields errors={fieldErrors} />
            <ErrorNotice error={error} />
            {busy && (
              <div className="upload-progress" role="status">
                <progress value={progress} max={100} />
                <span>
                  {progress < 100
                    ? `Uploading ${progress}%`
                    : "Making your image ready…"}
                </span>
              </div>
            )}
            <button className="primary-button publish-button" disabled={busy}>
              {busy ? "Publishing…" : "Publish pin"}
              <ArrowRight size={18} />
            </button>
            <p className="muted small-text">
              Your pin is public. Credit its source when you can.
            </p>
          </div>
        )}
      </form>
    </main>
  );
}

function Comments({ postId }: { postId: number }) {
  const page = usePage<Comment>(`/posts/${postId}/comments/`);
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Comment | null>(null);
  const [deleting, setDeleting] = useState<Comment | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>, comment?: Comment) {
    event.preventDefault();
    const form = event.currentTarget;
    const text = new FormData(form).get("text");
    setBusy(true);
    setError("");
    try {
      const result = await request<Comment>(
        comment ? `/comments/${comment.id}/` : `/posts/${postId}/comments/`,
        comment ? "PATCH" : "POST",
        { text },
      );
      page.setItems((previous) =>
        comment
          ? previous.map((item) => (item.id === result.id ? result : item))
          : [...previous, result],
      );
      if (comment) setEditing(null);
      else form.reset();
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setError("");
    try {
      await request(`/comments/${deleting.id}/`, "DELETE", {});
      page.setItems((previous) =>
        previous.filter((item) => item.id !== deleting.id),
      );
      setDeleting(null);
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="comments-section">
      <div className="comments-heading">
        <h2>Comments</h2>
        <span>
          {page.items.length}
          {page.cursor ? "+" : ""}
        </span>
      </div>
      <ErrorNotice error={!editing && !deleting ? error : ""} />
      {page.items
        .slice()
        .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id)
        .map((comment) => (
          <article className="comment" key={comment.id}>
            <Link to={`/u/${comment.author.username}`}>
              <Avatar author={comment.author} size="small" />
            </Link>
            <div>
              <div className="comment-heading">
                <Link to={`/u/${comment.author.username}`}>
                  {comment.author.display_name || comment.author.username}
                </Link>
                <time dateTime={comment.created_at}>
                  {new Date(comment.created_at).toLocaleDateString([], {
                    month: "short",
                    day: "numeric",
                  })}
                  {new Date(comment.updated_at).getTime() -
                    new Date(comment.created_at).getTime() >
                    1000 && " · Edited"}
                </time>
              </div>
              <p>{comment.text}</p>
              {user?.id !== comment.author.id && (
                <ReportButton
                  kind="comment"
                  target={comment.id}
                  label="Report comment"
                />
              )}
              {user?.id === comment.author.id && (
                <details className="comment-actions">
                  <summary aria-label="Comment actions">
                    <MoreHorizontal size={18} />
                  </summary>
                  <div>
                    <button
                      onClick={() => {
                        setError("");
                        setEditing(comment);
                      }}
                    >
                      <Pencil size={12} />
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        setError("");
                        setDeleting(comment);
                      }}
                    >
                      <Trash2 size={12} />
                      Delete
                    </button>
                  </div>
                </details>
              )}
            </div>
          </article>
        ))}
      {page.loading && (
        <p className="muted" role="status">
          Loading comments…
        </p>
      )}
      <ErrorNotice error={page.error} />
      {page.error && (
        <button
          className="quiet-button"
          onClick={() => (page.cursor ? void page.loadMore() : page.reload())}
        >
          Try again
        </button>
      )}
      {page.cursor && (
        <button
          className="quiet-button"
          onClick={() => void page.loadMore()}
          disabled={page.loading}
        >
          More comments
        </button>
      )}
      {!page.loading && !page.items.length && !page.error && (
        <p className="muted">Be the first to leave a little thought.</p>
      )}
      <form className="comment-form" onSubmit={(event) => void submit(event)}>
        <label className="field">
          Your comment
          <textarea
            name="text"
            required
            maxLength={2000}
            placeholder="What do you think?"
            rows={2}
          />
        </label>
        <button className="secondary-button" disabled={busy}>
          Post comment <ArrowRight size={15} />
        </button>
      </form>
      {editing && (
        <Modal
          title="Edit your comment"
          busy={busy}
          close={() => setEditing(null)}
        >
          <form onSubmit={(event) => void submit(event, editing)}>
            <label className="field">
              Comment
              <textarea
                name="text"
                required
                maxLength={2000}
                defaultValue={editing.text}
              />
            </label>
            <ErrorNotice error={error} />
            <button className="primary-button" disabled={busy}>
              Save comment
            </button>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal
          title="Delete this comment?"
          busy={busy}
          close={() => setDeleting(null)}
        >
          <p className="modal-copy">
            This will remove your comment permanently.
          </p>
          <ErrorNotice error={error} />
          <button
            className="danger-button"
            disabled={busy}
            onClick={() => void remove()}
          >
            Delete comment
          </button>
        </Modal>
      )}
    </section>
  );
}

export function PostDetail({ onBack }: { onBack?: () => void } = {}) {
  const location = useLocation();
  const { id } = useParams();
  const resource = useResource<Post>(`/posts/${id}/`);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const post = resource.data;
  useEffect(() => {
    if (!post || post.moderation_status !== "approved") return;
    if (location.state?.pinClick)
      void recordPinEvent(post.id, "click", user?.id);
    const timer = setTimeout(
      () => void recordPinEvent(post.id, "view", user?.id),
      500,
    );
    return () => clearTimeout(timer);
  }, [post?.id, location.state?.pinClick]);
  async function edit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!post) return;
    setBusy(true);
    setError("");
    try {
      resource.setData(
        await request<Post>(
          `/posts/${post.id}/`,
          "PATCH",
          Object.fromEntries(new FormData(event.currentTarget)),
        ),
      );
      setEditing(false);
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!post) return;
    setBusy(true);
    setError("");
    try {
      await request(`/posts/${post.id}/`, "DELETE", {});
      navigate("/");
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  if (resource.loading)
    return (
      <main className="collection-page detail-page" aria-busy="true">
        <div className="pin-detail-skeleton" role="status">
          <div
            className="image-skeleton"
            style={{
              aspectRatio: `${location.state?.pinPreview?.width || 480}/${location.state?.pinPreview?.height || 640}`,
            }}
          />
          <div>
            <Owl state="think" />
            <p>Opening your inspiration...</p>
          </div>
        </div>
      </main>
    );
  if (!post)
    return (
      <main className="loading-page">
        <ErrorNotice error={resource.error} />
        <button className="secondary-button" onClick={resource.reload}>
          Try again
        </button>
        <Link to="/">Back home</Link>
      </main>
    );
  return (
    <main className="collection-page detail-page">
      <button
        className="back-link quiet-button"
        type="button"
        onClick={() => {
          if (onBack) onBack();
          else if (window.history.state?.idx > 0) navigate(-1);
          else navigate("/");
        }}
      >
        <ArrowLeft size={16} />
        Back to inspiration
      </button>
      <article className="post-detail">
        <div className="detail-image">
          <button
            className="image-expand"
            aria-label="View full image"
            onClick={() => setViewing(true)}
          >
            <Maximize2 size={18} />
          </button>
          <img
            src={post.image}
            onLoad={() => setImageReady(true)}
            onError={() => {
              setImageReady(true);
              setError("This image could not be loaded. Refresh to try again.");
            }}
            width={post.width}
            height={post.height}
            alt={post.alt_text || post.title}
          />
          {!imageReady && (
            <span
              className="image-skeleton detail-image-skeleton"
              aria-hidden="true"
            />
          )}
        </div>
        <div className="detail-copy">
          {post.scan_id && post.moderation_status !== "approved" && (
            <ImageCheck
              id={post.scan_id}
              approved={() => {
                void request<Post>(`/posts/${post.id}/`)
                  .then(resource.setData)
                  .catch((e) => setError(message(e)));
              }}
            />
          )}
          <h1>{post.title}</h1>
          <ErrorNotice error={error} />
          <Link className="author-link" to={`/u/${post.owner.username}`}>
            <Avatar author={post.owner} size="small" />
            <span>
              <strong>{post.owner.display_name || post.owner.username}</strong>
              <small>@{post.owner.username}</small>
            </span>
          </Link>
          <div className="detail-actions">
            <LikeButton post={post} />
            <details className="pin-preference-menu">
              <summary aria-label="More pin actions">
                <MoreHorizontal size={20} />
              </summary>
              <div>
                <button
                  type="button"
                  className="quiet-button"
                  onClick={async () => {
                    try {
                      await recordPinEvent(post.id, "hide", user?.id);
                      window.dispatchEvent(
                        new CustomEvent("pin-hidden", { detail: post.id }),
                      );
                      notify("Pin hidden. We will show fewer ideas like this.");
                      if (onBack) onBack();
                      else navigate("/");
                    } catch (error) {
                      setError(message(error));
                    }
                  }}
                >
                  Not interested
                </button>
                {post.owner.id !== user?.id && (
                  <ReportButton kind="post" target={post.id} label="Report" />
                )}
              </div>
            </details>
            {(!post.moderation_status ||
              post.moderation_status === "approved") && (
              <ShareControl
                title="pin"
                path={`/pin/${post.id}`}
                chat={`/messages?pin=${post.id}`}
              />
            )}
            {post.source_url ? (
              <a
                className="source-link"
                href={post.source_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Visit source <ArrowUpRight size={15} />
              </a>
            ) : (
              <span className="detail-date">
                {new Date(post.created_at).toLocaleDateString([], {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            )}
            <button
              className="primary-button compact"
              onClick={() => setSaving(true)}
              disabled={
                !!post.moderation_status &&
                post.moderation_status !== "approved"
              }
            >
              <Bookmark size={17} />
              Save
            </button>
          </div>
          {post.description && (
            <p className="post-description">{post.description}</p>
          )}
          <div className="post-tags">
            {post.tags.map((tag) => (
              <Link to={`/?tag=${encodeURIComponent(tag)}`} key={tag}>
                #{tag}
              </Link>
            ))}
          </div>
          {post.owner.id === user?.id && (
            <details className="owner-actions pin-owner-menu">
              <summary aria-label="Pin options">
                <MoreHorizontal size={18} />
              </summary>
              <div>
                <button
                  className="quiet-button"
                  onClick={() => {
                    setError("");
                    setEditing(true);
                  }}
                >
                  <Pencil size={14} />
                  Edit pin
                </button>
                <button
                  className="quiet-button danger-text"
                  onClick={() => {
                    setError("");
                    setDeleting(true);
                  }}
                >
                  <Trash2 size={14} />
                  Delete pin
                </button>
              </div>
            </details>
          )}
          {(!post.moderation_status ||
            post.moderation_status === "approved") && (
            <Comments key={post.id} postId={post.id} />
          )}
        </div>
      </article>
      {post.moderation_status === "approved" && (
        <section
          className="related-pins explore-page"
          aria-label="More to explore"
        >
          <h2>More to explore</h2>
          <PostGrid
            key={post.id}
            feedFirst
            endpoint={`/pins/${post.id}/related/`}
          />
        </section>
      )}
      {viewing && (
        <Modal title={post.title} close={() => setViewing(false)}>
          <img
            className="full-image"
            src={post.image}
            alt={post.alt_text || post.title}
          />
        </Modal>
      )}
      {saving && <SaveDialog post={post} close={() => setSaving(false)} />}{" "}
      {editing && (
        <Modal
          title="Edit your pin"
          busy={busy}
          close={() => setEditing(false)}
        >
          <form onSubmit={edit}>
            <PostFields post={post} />
            <ErrorNotice error={error} />
            <button className="primary-button" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
              <Check size={17} />
            </button>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal
          title="Delete this pin?"
          busy={busy}
          close={() => setDeleting(false)}
        >
          <p className="modal-copy">
            Your image, comments, and saves of this pin will be removed
            permanently.
          </p>
          <ErrorNotice error={error} />
          <button
            className="danger-button"
            onClick={() => void remove()}
            disabled={busy}
          >
            Delete pin
          </button>
        </Modal>
      )}
    </main>
  );
}
