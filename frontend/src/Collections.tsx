import { useEffect, useRef, useState } from "react";
import { ImageCheck } from "./ImageCheck";
import Referrals from "./Referrals";
import { pluralize } from "./format";
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
  LayoutGrid,
  Globe,
  Search as SearchIcon,
  Share2,
} from "lucide-react";
import { request, upload } from "./api";
import type { User } from "./api";
import { useAuth } from "./auth";
import { useDebouncedValue, usePage, useResource } from "./hooks";
import { SearchField, ShareControl, notify } from "./ProductUI";
import Owl from "./Owl";
import { FollowControls } from "./Community";
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
  filter,
}: {
  owner: string;
  own: boolean;
  changed?: () => void;
  filter?: string;
}) {
  const [query, setQuery] = useState("");
  const [privacy, setPrivacy] = useState("all");
  const settled = useDebouncedValue(filter ?? query);
  const page = usePage<Board>(
    `/boards/?owner=${encodeURIComponent(owner)}&q=${encodeURIComponent(settled)}&privacy=${privacy}`,
  );
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
      <div className="product-toolbar">
        {filter === undefined && (
          <SearchField value={query} change={setQuery} label="Search boards" />
        )}
        {own && (
          <div className="tabs board-visibility">
            {["all", "public", "private"].map((value) => (
              <button
                key={value}
                aria-pressed={privacy === value}
                className={privacy === value ? "active" : ""}
                onClick={() => setPrivacy(value)}
              >
                {value === "all" ? (
                  "All boards"
                ) : value === "private" ? (
                  <>
                    <Lock size={14} />
                    Private
                  </>
                ) : (
                  <>
                    <Globe size={14} />
                    Public
                  </>
                )}
              </button>
            ))}
          </div>
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
          <Owl state="sleep" />
          <h2>
            {query || privacy !== "all"
              ? "No matching boards"
              : own
                ? "Start your first collection"
                : "No public boards yet"}
          </h2>
          <p>
            {query || privacy !== "all"
              ? "Try another search or show all boards."
              : own
                ? "Create a board and give your ideas a home."
                : "No public boards here yet."}
          </p>
          {query || privacy !== "all" ? (
            <button
              className="secondary-button"
              onClick={() => {
                setQuery("");
                setPrivacy("all");
              }}
            >
              Show all boards
            </button>
          ) : (
            own && (
              <button
                className="secondary-button"
                onClick={() => setCreating(true)}
              >
                Create a board <Plus size={16} />
              </button>
            )
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
    <main className="collection-page product-page boards-page">
      <div className="page-heading">
        <div>
          <h1>Your boards</h1>
          <p>Your ideas, organized. Private boards are visible only to you.</p>
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
  const [scanId, setScanId] = useState<number | null>(
    auth.user?.profile.avatar_scan?.id || null,
  );
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
      const result = await upload<{ user: User; scan?: { id: number } }>(
        "/profile/avatar/",
        body,
        setProgress,
        controller.current.signal,
      );
      auth.setUser(result.user);
      if (result.scan) setScanId(result.scan.id);
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
      setScanId(null);
      done();
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  const currentAvatar = auth.user?.profile.avatar;
  return (
    <Modal title="Edit profile" busy={busy} close={close}>
      {scanId && (
        <ImageCheck
          id={scanId}
          picture
          approved={(user) => {
            auth.setUser(user);
            setScanId(null);
            done();
          }}
        />
      )}
      <div className="avatar-editor">
        <label className="avatar-change-control">
          <Avatar
            author={{
              username: profile.username,
              display_name: profile.display_name,
              avatar: currentAvatar || null,
            }}
          />
          <span>Change picture</span>
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
        <div className="form-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={busy}
            onClick={close}
          >
            Cancel
          </button>
          <button className="primary-button" disabled={busy}>
            {busy ? "Saving…" : "Save profile"}
            <Check size={17} />
          </button>
        </div>
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
  const own = auth.user?.username === username;
  const tab =
    params.get("tab") === "boards"
      ? "boards"
      : params.get("tab") === "liked" && own
        ? "liked"
        : "pins";
  const [editing, setEditing] = useState(false),
    [searching, setSearching] = useState(false),
    [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const settled = useDebouncedValue(query);
  const profile = resource.data;
  if (!profile)
    return (
      <main className="loading-page" role="status">
        <Owl state="think" />
        <ErrorNotice error={resource.error} />
        {resource.error ? (
          <button onClick={resource.reload}>Try again</button>
        ) : (
          "Opening profile..."
        )}
      </main>
    );
  async function share() {
    try {
      await navigator.clipboard.writeText(
        new URL(`/u/${profile!.username}`, location.origin).href,
      );
      notify("Profile link copied");
    } catch {
      notify("Copy the profile URL from your address bar.");
    }
  }
  return (
    <main className="collection-page product-page profile-page explore-page">
      <section className="profile-header">
        <Avatar author={profile} />
        <div className="profile-info">
          <h1>
            {profile.display_name || profile.username}
            {(profile.is_guest || (own && auth.user?.is_guest)) && (
              <span className="guest-badge">Guest</span>
            )}
          </h1>
          <p className="profile-username">@{profile.username}</p>
          {profile.bio && <p className="profile-bio">{profile.bio}</p>}
          <FollowControls
            profile={profile}
            reload={resource.reload}
            pinCount={profile.post_count}
          />
        </div>
        <div className="profile-actions">
          {own ? (
            <button
              className="secondary-button"
              onClick={() => setEditing(true)}
            >
              <Pencil size={16} />
              Edit profile
            </button>
          ) : (
            <Link
              className="secondary-button"
              to={`/messages?to=${encodeURIComponent(profile.username)}`}
            >
              Message
            </Link>
          )}
          <button className="secondary-button" onClick={() => void share()}>
            <Share2 size={16} />
            Share profile
          </button>
        </div>
      </section>
      {own && <Referrals />}
      <div className="profile-navigation">
        <div className="tabs profile-tabs" aria-label="Profile content">
          {[
            ["pins", "Created"],
            ["boards", "Boards"],
            ...(own ? [["liked", "Liked"]] : []),
          ].map(([value, label]) => (
            <button
              key={value}
              className={tab === value ? "active" : ""}
              aria-pressed={tab === value}
              onClick={() => setParams(value === "pins" ? {} : { tab: value })}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="profile-tools">
          {tab !== "liked" && (
            <button
              className="icon-button"
              aria-label="Search profile"
              aria-expanded={searching}
              onClick={() => {
                setSearching(!searching);
                if (searching) setQuery("");
              }}
            >
              <SearchIcon size={20} />
            </button>
          )}
          {own &&
            (tab === "boards" ? (
              <button
                className="icon-button"
                aria-label="Create board"
                onClick={() => setCreating(true)}
              >
                <Plus size={20} />
              </button>
            ) : (
              <Link
                className="icon-button"
                aria-label="Create pin"
                to="/create"
              >
                <Plus size={20} />
              </Link>
            ))}
        </div>
      </div>
      {searching && tab !== "liked" && (
        <div className="profile-search">
          <SearchField
            value={query}
            change={setQuery}
            label="Search profile content"
            placeholder={
              tab === "boards" ? "Find a board" : "Find a created pin"
            }
          />
        </div>
      )}
      {tab === "boards" ? (
        <BoardsList
          key={profile.board_count}
          owner={profile.username}
          own={own}
          changed={resource.reload}
          filter={query}
        />
      ) : (
        <PostGrid
          key={tab}
          feedFirst
          emptyOwl
          endpoint={
            tab === "liked"
              ? `/profiles/${encodeURIComponent(profile.username)}/liked/`
              : `/feed/?owner=${encodeURIComponent(profile.username)}&q=${encodeURIComponent(settled)}`
          }
          empty={
            query
              ? "No matching pins"
              : tab === "liked"
                ? "A little room for what you love."
                : "Share your first little thing"
          }
          emptyDescription={
            tab === "liked"
              ? "Like a pin to keep it here."
              : "Your next little idea belongs here."
          }
          emptyAction={
            <Link
              className="secondary-button"
              to={tab === "liked" || !own ? "/" : "/create"}
            >
              {tab === "liked" || !own
                ? "Explore pins"
                : "Share your first little thing"}
            </Link>
          }
        />
      )}
      {editing && (
        <EditProfile
          profile={profile}
          close={() => setEditing(false)}
          done={resource.reload}
        />
      )}
      {creating && (
        <Modal title="Create a board" close={() => setCreating(false)}>
          <BoardForm
            done={() => {
              setCreating(false);
              resource.reload();
            }}
          />
        </Modal>
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
  const [organizing, setOrganizing] = useState(false);
  const [query, setQuery] = useState("");
  const settled = useDebouncedValue(query);
  const [sort, setSort] = useState("newest");
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
    <main className="collection-page product-page board-detail-page">
      <Link className="back-link" to={`/u/${board.owner}?tab=boards`}>
        <ArrowLeft size={16} />
        All collections by @{board.owner}
      </Link>
      <section className="board-heading">
        <div className="board-hero-cover">
          {board.cover ? (
            <img src={board.cover} alt="" />
          ) : (
            <Bookmark size={38} />
          )}
        </div>
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
        {!board.is_private && (
          <ShareControl title="board" path={`/boards/${board.id}`} />
        )}
        <h1>{board.name}</h1>
        {board.description && <p>{board.description}</p>}
        <span className="muted">
          {pluralize(board.post_count, "pin")} ·{" "}
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
      <div className="product-toolbar">
        <SearchField
          value={query}
          change={setQuery}
          label="Search board pins"
        />
        <div className="toolbar-filters">
          <label>
            Sort
            <select
              aria-label="Sort board pins"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="newest">Newest saved</option>
              <option value="oldest">Oldest saved</option>
            </select>
          </label>
          {own && (
            <button
              className="secondary-button"
              disabled={!board.post_count}
              aria-pressed={organizing}
              onClick={() => setOrganizing((v) => !v)}
            >
              <LayoutGrid size={16} />
              {organizing ? "Done organizing" : "Organize"}
            </button>
          )}
        </div>
      </div>
      {organizing && (
        <p className="organize-notice" role="status">
          Choose a cover or remove pins from this board. Original pins stay
          available.
        </p>
      )}
      <ErrorNotice error={!editing && !deleting && !removing ? error : ""} />
      <PostGrid
        key={`${board.id}-${version}`}
        endpoint={`/boards/${board.id}/posts/?q=${encodeURIComponent(settled)}&sort=${sort}`}
        empty={query ? "No matching pins" : "Your next idea belongs here"}
        emptyDescription={
          query
            ? "Try another search or clear the filter."
            : "Save pins to this board as you explore."
        }
        emptyAction={
          query ? (
            <button className="secondary-button" onClick={() => setQuery("")}>
              Clear pin search
            </button>
          ) : (
            <Link className="secondary-button" to="/">
              Find pins to save <ArrowRight size={16} />
            </Link>
          )
        }
        action={
          own && organizing
            ? (post) => (
                <div className="board-pin-actions">
                  <button
                    className="board-action-button"
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
                    <span>
                      {board.cover_post_id === post.id
                        ? "Cover selected"
                        : "Set cover"}
                    </span>
                  </button>
                  <button
                    className="board-action-button"
                    aria-label={`Remove ${post.title} from board`}
                    title="Remove from board"
                    onClick={() => {
                      setError("");
                      setRemoving(post);
                    }}
                  >
                    <Trash2 size={14} />
                    <span>Remove</span>
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
