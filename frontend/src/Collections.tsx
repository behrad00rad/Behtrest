import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  ImagePlus,
  Lock,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { request, upload } from "./api";
import type { User } from "./api";
import { useAuth } from "./auth";
import { usePage, useResource } from "./hooks";
import type { Board, Post, Profile } from "./types";
import {
  Avatar,
  BoardCard,
  BoardForm,
  ErrorNotice,
  message,
  Modal,
  PostGrid,
} from "./components";

function BoardsList({
  owner,
  own,
  changed,
}: {
  owner: string;
  own: boolean;
  changed?: () => void;
}) {
  const page = usePage<Board>(`/boards/?owner=${encodeURIComponent(owner)}`);
  const [creating, setCreating] = useState(false);
  return (
    <>
      <div className="section-heading">
        <span>{own ? "Your collections" : "Their collections"}</span>
        {own && (
          <button
            className="secondary-button"
            onClick={() => setCreating(true)}
          >
            <Plus size={16} />
            New board
          </button>
        )}
      </div>
      <div className="boards-grid">
        {page.items.map((board) => (
          <BoardCard key={board.id} board={board} />
        ))}
      </div>
      {page.loading && (
        <p className="feed-status" role="status">
          Opening collections…
        </p>
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
          <Bookmark size={32} />
          <h2>A place for your next obsession.</h2>
          <p>
            {own
              ? "Create a board and give your ideas a home."
              : "No public boards here yet."}
          </p>
          {own && (
            <button
              className="secondary-button"
              onClick={() => setCreating(true)}
            >
              Create your first board <Plus size={16} />
            </button>
          )}
        </div>
      )}
      {page.cursor && (
        <button
          className="secondary-button"
          onClick={() => void page.loadMore()}
          disabled={page.loading}
        >
          More boards
        </button>
      )}
      {creating && (
        <Modal title="Create a board" close={() => setCreating(false)}>
          <BoardForm
            done={() => {
              setCreating(false);
              page.reload();
              changed?.();
            }}
          />
        </Modal>
      )}
    </>
  );
}

export function MyBoards() {
  const { user } = useAuth();
  return (
    <main className="collection-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">IDEAS, WITH A HOME</span>
          <h1>
            Your little <em>collections.</em>
          </h1>
          <p>Keep a mood, plan a project, or follow a feeling.</p>
        </div>
      </div>
      {user && <BoardsList owner={user.username} own />}
    </main>
  );
}

function EditProfile({
  profile,
  close,
  done,
}: {
  profile: Profile;
  close: () => void;
  done: () => void;
}) {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function edit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await request<{ user: User }>(
        "/auth/profile/",
        "PATCH",
        Object.fromEntries(new FormData(event.currentTarget)),
      );
      auth.setUser(result.user);
      done();
      close();
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  async function avatar(file: File | undefined) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setError("Choose an image smaller than 8 MB.");
      return;
    }
    setBusy(true);
    setError("");
    setProgress(0);
    controller.current = new AbortController();
    const body = new FormData();
    body.append("image", file);
    try {
      const result = await upload<{ user: User }>(
        "/profile/avatar/",
        body,
        setProgress,
        controller.current.signal,
      );
      auth.setUser(result.user);
      done();
    } catch (error) {
      if (!controller.current.signal.aborted) setError(message(error));
    } finally {
      if (!controller.current.signal.aborted) setBusy(false);
    }
  }
  async function removeAvatar() {
    setBusy(true);
    setError("");
    try {
      const result = await request<{ user: User }>(
        "/profile/avatar/remove/",
        "DELETE",
        {},
      );
      auth.setUser(result.user);
      done();
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  const currentAvatar = auth.user?.profile.avatar;
  return (
    <Modal title="A little more you" close={close}>
      <div className="avatar-editor">
        <Avatar
          author={{
            username: profile.username,
            display_name: profile.display_name,
            avatar: currentAvatar || null,
          }}
        />
        <label className="secondary-button">
          Change picture
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Choose profile picture"
            disabled={busy}
            onChange={(event) => void avatar(event.target.files?.[0])}
          />
        </label>
        {currentAvatar && (
          <button
            className="quiet-button"
            onClick={() => void removeAvatar()}
            disabled={busy}
          >
            Remove
          </button>
        )}
      </div>
      {busy && progress > 0 && (
        <p className="muted" role="status">
          {progress < 100 ? `Uploading ${progress}%` : "Saving…"}
        </p>
      )}
      <form onSubmit={edit}>
        <label className="field">
          Display name
          <input
            name="display_name"
            maxLength={80}
            defaultValue={profile.display_name}
            placeholder="What should we call you?"
          />
        </label>
        <label className="field">
          A little about you
          <textarea
            name="bio"
            maxLength={500}
            defaultValue={profile.bio}
            placeholder="What keeps you curious?"
          />
        </label>
        <ErrorNotice error={error} />
        <button className="primary-button" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
          <Check size={17} />
        </button>
      </form>
    </Modal>
  );
}

export function ProfilePage() {
  const { username = "" } = useParams();
  const auth = useAuth();
  const resource = useResource<Profile>(
    `/profiles/${encodeURIComponent(username)}/`,
  );
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "boards" ? "boards" : "pins";
  const [editing, setEditing] = useState(false);
  const profile = resource.data;
  if (resource.loading && !profile)
    return (
      <main className="loading-page" role="status">
        Getting to know a curious mind…
      </main>
    );
  if (!profile)
    return (
      <main className="loading-page">
        <ErrorNotice error={resource.error} />
        <button className="secondary-button" onClick={resource.reload}>
          Try again
        </button>
      </main>
    );
  const own = auth.user?.id === profile.id;
  return (
    <main className="collection-page">
      <section className="profile-header">
        <Avatar author={profile} />
        <span className="eyebrow">A CURIOUS MIND</span>
        <h1>{profile.display_name || profile.username}</h1>
        <p className="profile-username">@{profile.username}</p>
        {profile.bio && <p className="profile-bio">{profile.bio}</p>}
        <p className="profile-counts">
          {profile.post_count} pins <span>·</span> {profile.board_count}{" "}
          {own ? "boards" : "public boards"}
        </p>
        {own && (
          <button className="secondary-button" onClick={() => setEditing(true)}>
            <Pencil size={15} />
            Edit profile
          </button>
        )}
      </section>
      <div className="tabs profile-tabs">
        <button
          className={tab === "pins" ? "active" : ""}
          aria-pressed={tab === "pins"}
          onClick={() => setParams({})}
        >
          Created pins
        </button>
        <button
          className={tab === "boards" ? "active" : ""}
          aria-pressed={tab === "boards"}
          onClick={() => setParams({ tab: "boards" })}
        >
          Boards
        </button>
      </div>
      {tab === "pins" ? (
        <PostGrid
          endpoint={`/feed/?owner=${encodeURIComponent(profile.username)}`}
          empty={
            own ? "Share the things that move you." : "No pins here just yet."
          }
        />
      ) : (
        <BoardsList
          owner={profile.username}
          own={own}
          changed={resource.reload}
        />
      )}{" "}
      {editing && (
        <EditProfile
          profile={profile}
          close={() => setEditing(false)}
          done={resource.reload}
        />
      )}
    </main>
  );
}

export function BoardDetail() {
  const { id } = useParams();
  const auth = useAuth();
  const resource = useResource<Board>(`/boards/${id}/`);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removing, setRemoving] = useState<Post | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const navigate = useNavigate();
  const board = resource.data;
  async function removeBoard() {
    if (!board) return;
    setBusy(true);
    setError("");
    try {
      await request(`/boards/${board.id}/manage/`, "DELETE", {});
      navigate("/boards");
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  async function removePin() {
    if (!board || !removing) return;
    setBusy(true);
    setError("");
    try {
      await request(`/boards/${board.id}/saves/${removing.id}/`, "DELETE", {});
      setRemoving(null);
      setVersion((value) => value + 1);
      resource.reload();
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  async function setCover(post: Post) {
    if (!board) return;
    setBusy(true);
    setError("");
    try {
      resource.setData(
        await request<Board>(`/boards/${board.id}/manage/`, "PATCH", {
          cover_post_id: post.id,
        }),
      );
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  if (resource.loading && !board)
    return (
      <main className="loading-page" role="status">
        Opening this collection…
      </main>
    );
  if (!board)
    return (
      <main className="loading-page">
        <h1>A collection out of reach.</h1>
        <ErrorNotice error={resource.error} />
        <button className="secondary-button" onClick={resource.reload}>
          Try again
        </button>
        <Link className="text-link" to="/boards">
          Your boards <ArrowRight size={16} />
        </Link>
      </main>
    );
  const own = board.owner === auth.user?.username;
  return (
    <main className="collection-page">
      <Link className="back-link" to={`/u/${board.owner}?tab=boards`}>
        <ArrowLeft size={16} />
        All collections by @{board.owner}
      </Link>
      <section className="board-heading">
        <span className="eyebrow">
          {board.is_private ? (
            <>
              <Lock size={12} />
              YOUR PRIVATE CORNER
            </>
          ) : (
            "A COLLECTION OF GOOD IDEAS"
          )}
        </span>
        <h1>{board.name}</h1>
        {board.description && <p>{board.description}</p>}
        <span className="muted">
          {board.post_count} pins ·{" "}
          <Link to={`/u/${board.owner}`}>@{board.owner}</Link>
        </span>
        {own && (
          <div className="owner-actions">
            <button
              className="secondary-button"
              onClick={() => {
                setError("");
                setEditing(true);
              }}
            >
              <Pencil size={15} />
              Edit board
            </button>
            <button
              className="quiet-button danger-text"
              onClick={() => {
                setError("");
                setDeleting(true);
              }}
            >
              <Trash2 size={15} />
              Delete board
            </button>
            <Link className="quiet-button" to="/">
              <ImagePlus size={15} />
              Find more pins
            </Link>
          </div>
        )}
      </section>
      <ErrorNotice error={!editing && !deleting && !removing ? error : ""} />
      <PostGrid
        key={`${board.id}-${version}`}
        endpoint={`/boards/${board.id}/posts/`}
        empty="A little room for your next idea."
        action={
          own
            ? (post) => (
                <div className="board-pin-actions">
                  <button
                    className="icon-button"
                    aria-label={`Use ${post.title} as board cover`}
                    title="Use as cover"
                    aria-pressed={board.cover_post_id === post.id}
                    disabled={busy}
                    onClick={() => void setCover(post)}
                  >
                    {board.cover_post_id === post.id ? (
                      <Check size={14} />
                    ) : (
                      <ImagePlus size={14} />
                    )}
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Remove ${post.title} from board`}
                    title="Remove from board"
                    onClick={() => {
                      setError("");
                      setRemoving(post);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            : undefined
        }
      />
      {editing && (
        <Modal title="Edit board" close={() => setEditing(false)}>
          <BoardForm
            existing={board}
            done={(value) => {
              resource.setData(value);
              setEditing(false);
            }}
          />
        </Modal>
      )}
      {deleting && (
        <Modal title="Delete this board?" close={() => setDeleting(false)}>
          <p className="modal-copy">
            The board and its saves will be removed. Original pins remain
            available.
          </p>
          <ErrorNotice error={error} />
          <button
            className="danger-button"
            disabled={busy}
            onClick={() => void removeBoard()}
          >
            Delete board
          </button>
        </Modal>
      )}
      {removing && (
        <Modal
          title="Remove this pin from your board?"
          close={() => setRemoving(null)}
        >
          <p className="modal-copy">
            You can save it again any time. The original pin stays available.
          </p>
          <ErrorNotice error={error} />
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => void removePin()}
          >
            Remove from board
          </button>
        </Modal>
      )}
    </main>
  );
}
