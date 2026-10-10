import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, Flag, Users } from "lucide-react";
import { request } from "./api";
import { useAuth } from "./auth";
import { usePage, useResource } from "./hooks";
import { Avatar, ErrorNotice, message, Modal } from "./components";
import type { Author, Profile } from "./types";

const activityChanged = () =>
  window.dispatchEvent(new Event("activity-changed"));

export function ActivityNav() {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    setUnread(0);
    if (!user) return;
    let disposed = false;
    let loading = false;
    const controller = new AbortController();
    async function sync() {
      if (loading || document.hidden) return;
      loading = true;
      try {
        const data = await request<{ unread: number }>(
          "/notifications/?page_size=1",
          "GET",
          undefined,
          true,
          controller.signal,
        );
        if (!disposed) setUnread(data.unread);
      } catch {
        /* The inbox displays retry feedback; badge polling is quiet. */
      } finally {
        loading = false;
      }
    }
    void sync();
    const refresh = () => void sync();
    const timer = setInterval(refresh, 30000);
    window.addEventListener("activity-changed", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      disposed = true;
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("activity-changed", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [user?.id]);
  return (
    <Link
      to="/notifications"
      className="activity-trigger"
      aria-label="Notifications"
      title="Notifications"
    >
      <Bell size={20} />
      {unread > 0 && (
        <b aria-label={`${unread} unread notifications`}>
          {unread > 99 ? "99+" : unread}
        </b>
      )}
    </Link>
  );
}

export function ReportButton({
  kind,
  target,
  label = "Report",
}: {
  kind: "post" | "comment" | "user";
  target: number;
  label?: string;
}) {
  const [open, setOpen] = useState(false),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request("/reports/", "POST", { kind, target_id: target, reason });
      setSent(true);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="quiet-button report-trigger"
        aria-label={label}
        onClick={() => {
          setOpen(true);
          setSent(false);
          setReason("");
          setError("");
        }}
      >
        <Flag size={14} />
        {label}
      </button>
      {open && (
        <Modal title="Report content" busy={busy} close={() => setOpen(false)}>
          {sent ? (
            <div className="report-confirmation">
              <h3>Report received</h3>
              <p>Our moderators can review the content and your reason.</p>
              <button className="primary-button" onClick={() => setOpen(false)}>
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={submit}>
              <label className="field">
                Reason
                <textarea
                  required
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Tell us what needs attention."
                />
              </label>
              <p className="muted">
                Your report is visible only to authorized moderators.
              </p>
              <ErrorNotice error={error} />
              <button
                className="primary-button"
                disabled={busy || !reason.trim()}
              >
                {busy ? "Submitting…" : "Submit report"}
              </button>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}

function PeopleList({
  username,
  direction,
}: {
  username: string;
  direction: "followers" | "following";
}) {
  const page = usePage<Author>(
    `/profiles/${encodeURIComponent(username)}/${direction}/`,
  );
  return (
    <>
      <div className="community-people">
        {page.items.map((person) => (
          <Link key={person.id} to={`/u/${person.username}`}>
            <Avatar author={person} size="small" />
            <span>
              <strong>{person.display_name || person.username}</strong>
              <small>@{person.username}</small>
            </span>
          </Link>
        ))}
      </div>
      <ErrorNotice error={page.error} />
      {page.loading && <p role="status">Loading people…</p>}
      {!page.loading && !page.error && !page.items.length && (
        <p className="muted">No {direction} yet.</p>
      )}
      {page.error && (
        <button className="secondary-button" onClick={page.reload}>
          Try again
        </button>
      )}
      {page.cursor && (
        <button
          className="secondary-button"
          disabled={page.loading}
          onClick={() => void page.loadMore()}
        >
          More people
        </button>
      )}
    </>
  );
}

export function FollowControls({
  profile,
  reload,
}: {
  profile: Profile;
  reload: () => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [list, setList] = useState<"followers" | "following" | null>(null);
  async function toggle() {
    setBusy(true);
    setError("");
    try {
      await request(
        `/profiles/${encodeURIComponent(profile.username)}/follow/`,
        profile.is_following ? "DELETE" : "POST",
        {},
      );
      reload();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="follow-controls">
      <div className="follow-counts">
        <button onClick={() => setList("followers")}>
          {profile.follower_count || 0} followers
        </button>
        <button onClick={() => setList("following")}>
          {profile.following_count || 0} following
        </button>
      </div>
      {user?.id !== profile.id && (
        <div className="follow-actions">
          <button
            className={
              profile.is_following ? "secondary-button" : "primary-button"
            }
            disabled={busy}
            aria-pressed={profile.is_following}
            onClick={() => void toggle()}
          >
            <Users size={15} />
            {busy ? "Updating…" : profile.is_following ? "Following" : "Follow"}
          </button>
          <ReportButton
            kind="user"
            target={profile.id}
            label="Report account"
          />
        </div>
      )}
      <ErrorNotice error={error} />
      {list && (
        <Modal
          title={list === "followers" ? "Followers" : "Following"}
          close={() => setList(null)}
        >
          <PeopleList username={profile.username} direction={list} />
        </Modal>
      )}
    </div>
  );
}

type Activity = {
  id: number;
  kind: "follow" | "comment" | "save" | "pin";
  actor: Author | null;
  post_title: string | null;
  path: string | null;
  read: boolean;
  created_at: string;
};
type Preferences = {
  follows: boolean;
  comments: boolean;
  saves: boolean;
  pins: boolean;
};
function NotificationSettings({ close }: { close: () => void }) {
  const prefs = useResource<Preferences>("/notifications/settings/");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function change(key: keyof Preferences, value: boolean) {
    if (busy || !prefs.data) return;
    const previous = prefs.data;
    prefs.setData({ ...previous, [key]: value });
    setBusy(true);
    setError("");
    try {
      prefs.setData(
        await request<Preferences>("/notifications/settings/", "PATCH", {
          [key]: value,
        }),
      );
    } catch (e) {
      prefs.setData(previous);
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Activity preferences" busy={busy} close={close}>
      <p className="muted">
        Choose which new activity appears in your inbox. Existing notifications
        stay available.
      </p>
      <ErrorNotice error={error || prefs.error} />
      {prefs.loading && <p role="status">Loading preferences…</p>}
      {prefs.data && (
        <div className="activity-preferences">
          {(["follows", "comments", "saves", "pins"] as const).map((key) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={prefs.data![key]}
                disabled={busy}
                onChange={(e) => void change(key, e.target.checked)}
              />
              {
                {
                  follows: "New followers",
                  comments: "Comments on your pins",
                  saves: "Public saves of your pins",
                  pins: "New pins from people you follow",
                }[key]
              }
            </label>
          ))}
        </div>
      )}
      {prefs.error && (
        <button className="secondary-button" onClick={prefs.reload}>
          Try again
        </button>
      )}
    </Modal>
  );
}

export function Notifications() {
  const { user } = useAuth();
  const [unreadOnly, setUnreadOnly] = useState(false),
    [settings, setSettings] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const page = usePage<Activity>(
    `/notifications/?unread=${unreadOnly ? 1 : 0}`,
  );
  const meta = useResource<{ unread: number; latest_id: number | null }>(
    "/notifications/?page_size=1",
  );
  const navigate = useNavigate();
  async function read(item?: Activity) {
    setBusy(true);
    setError("");
    try {
      if (!item && !meta.data?.latest_id) return;
      await request(
        "/notifications/",
        "POST",
        item ? { id: item.id } : { through_id: meta.data!.latest_id },
      );
      page.reload();
      meta.reload();
      activityChanged();
      if (item?.path) navigate(item.path);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  const labels = {
    follow: "started following you",
    comment: "commented on your pin",
    save: "saved your pin to a public board",
    pin: "shared a new pin",
  };
  return (
    <main className="collection-page product-page activity-page">
      <div className="page-heading">
        <div>
          <h1>Notifications</h1>
          <p>Updates from your collection and the people you follow.</p>
        </div>
        <button className="secondary-button" onClick={() => setSettings(true)}>
          Preferences
        </button>
      </div>
      <div className="product-toolbar">
        {user?.can_moderate && (
          <Link className="secondary-button" to="/moderation">
            Moderation
          </Link>
        )}
        <div className="tabs">
          <button
            aria-pressed={!unreadOnly}
            className={!unreadOnly ? "active" : ""}
            onClick={() => setUnreadOnly(false)}
          >
            All activity
          </button>
          <button
            aria-pressed={unreadOnly}
            className={unreadOnly ? "active" : ""}
            onClick={() => setUnreadOnly(true)}
          >
            Unread
          </button>
        </div>
        <button
          className="quiet-button"
          disabled={busy || !meta.data?.unread}
          onClick={() => void read()}
        >
          Mark all read
        </button>
      </div>
      <ErrorNotice error={error || page.error} />
      <div className="activity-list">
        {page.items.map((item) => (
          <article
            className={item.read ? "activity-row" : "activity-row unread"}
            key={item.id}
          >
            {item.actor ? (
              <Avatar author={item.actor} size="small" />
            ) : (
              <Bell size={22} />
            )}
            <div>
              <p>
                <strong>
                  {item.actor?.display_name ||
                    item.actor?.username ||
                    "Former member"}
                </strong>{" "}
                {labels[item.kind]}.
              </p>
              {item.post_title && <span>{item.post_title}</span>}
              <time dateTime={item.created_at}>
                {new Date(item.created_at).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </time>
            </div>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => void read(item)}
            >
              {item.path ? "View" : item.read ? "Read" : "Mark read"}
            </button>
          </article>
        ))}
      </div>
      {page.loading && <p role="status">Loading activity…</p>}
      {!page.loading && !page.error && !page.items.length && (
        <div className="empty-state">
          <Bell size={28} />
          <h2>{unreadOnly ? "You're all caught up" : "No activity yet"}</h2>
          <p>Follows, comments, public saves, and new pins will appear here.</p>
          <Link className="secondary-button" to="/">
            Explore pins
          </Link>
        </div>
      )}
      {page.error && (
        <button className="secondary-button" onClick={page.reload}>
          Try again
        </button>
      )}
      {page.cursor && (
        <button
          className="secondary-button"
          disabled={page.loading}
          onClick={() => void page.loadMore()}
        >
          More activity
        </button>
      )}
      {settings && <NotificationSettings close={() => setSettings(false)} />}
    </main>
  );
}

type Report = {
  media_url: string | null;
  id: number;
  kind: string;
  target_id: number;
  target_username: string | null;
  reporter: string | null;
  reason: string;
  evidence: string;
  status: string;
  created_at: string;
};
type Review = Report & {
  history: {
    id: number;
    action: string;
    reason: string;
    moderator: string | null;
    created_at: string;
  }[];
};
function ReviewReport({
  report,
  close,
  done,
}: {
  report: Report;
  close: () => void;
  done: () => void;
}) {
  const detail = useResource<Review>(`/moderation/${report.id}/`);
  const [action, setAction] = useState("dismiss"),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request(`/moderation/${report.id}/`, "POST", { action, reason });
      setReason("");
      detail.reload();
      done();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={`Review report #${report.id}`} busy={busy} close={close}>
      <p>
        <strong>{report.kind}</strong> by @
        {report.target_username || "deleted account"}
      </p>
      <p className="review-reason">{report.reason}</p>
      <details className="report-evidence">
        <summary>Reported content</summary>
        <pre>{report.evidence || "No text evidence available."}</pre>
        {detail.data?.media_url && (
          <img
            className="moderation-image"
            src={detail.data.media_url}
            alt="Reported image"
          />
        )}
      </details>
      <form onSubmit={submit}>
        <label className="field">
          Action
          <select
            aria-label="Action"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          >
            <option value="dismiss">Dismiss report</option>
            <option value="reopen">Reopen report</option>
            {report.kind === "image" && (
              <>
                <option value="approve_image">Approve image</option>
                <option value="reject_image">Reject image</option>
              </>
            )}
            {report.kind !== "user" && report.kind !== "image" && (
              <>
                <option value="hide">Hide content</option>
                <option value="restore">Restore content</option>
              </>
            )}
            <option value="suspend">Suspend account</option>
            <option value="restore_account">Restore account</option>
          </select>
        </label>
        <label className="field">
          Decision reason
          <textarea
            required
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <p className="muted">
          Content actions are reversible. Suspension prevents sign-in and hides
          the account's public content. Staff accounts are protected.
        </p>
        <ErrorNotice error={error || detail.error} />
        <button className="primary-button" disabled={busy || !reason.trim()}>
          {busy ? "Applying…" : "Apply decision"}
        </button>
      </form>
      <h3 className="review-history-title">Decision history</h3>
      {detail.loading && <p role="status">Loading history…</p>}
      {detail.data?.history.map((log) => (
        <div className="review-log" key={log.id}>
          <strong>{log.action.replaceAll("_", " ")}</strong>
          <p>{log.reason}</p>
          <small>
            @{log.moderator || "deleted account"} ·{" "}
            {new Date(log.created_at).toLocaleString()}
          </small>
        </div>
      ))}
      {detail.data && !detail.data.history.length && (
        <p className="muted">No decisions yet.</p>
      )}
    </Modal>
  );
}

function ModerationQueue() {
  const [status, setStatus] = useState("open"),
    [selected, setSelected] = useState<Report | null>(null);
  const page = usePage<Report>(`/moderation/?status=${status}`);
  const processing = usePage<{
    id: number;
    status: string;
    username: string;
    retrying: boolean;
  }>("/moderation/images/");
  const [processingError, setProcessingError] = useState("");
  async function reviewImage(id: number) {
    setProcessingError("");
    try {
      setSelected(
        await request<Report>(`/image-scans/${id}/review/`, "POST", {}),
      );
    } catch (e) {
      setProcessingError(message(e));
    }
  }
  return (
    <main className="collection-page product-page moderation-page">
      <div className="page-heading">
        <div>
          <h1>Moderation</h1>
          <p>Review reports and record content or account decisions.</p>
        </div>
      </div>
      <div className="product-toolbar">
        <label className="moderation-filter">
          Report status
          <select
            aria-label="Report status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {["open", "actioned", "dismissed", "all"].map((value) => (
              <option key={value} value={value}>
                {value[0].toUpperCase() + value.slice(1)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ErrorNotice error={page.error} />
      <ErrorNotice error={processingError || processing.error} />
      {processing.items.length > 0 && (
        <section aria-label="Images awaiting processing">
          <h2>Images awaiting processing</h2>
          <p className="muted">
            These images are private. You can review them manually if scanning
            is delayed.
          </p>
          {processing.items.map((item) => (
            <article className="moderation-row" key={item.id}>
              <div>
                <strong>Image by @{item.username}</strong>
                <p>{item.retrying ? "Scan retry pending" : item.status}</p>
              </div>
              <button
                className="secondary-button"
                onClick={() => void reviewImage(item.id)}
              >
                Review image #{item.id}
              </button>
            </article>
          ))}
          {processing.cursor && (
            <button
              className="secondary-button"
              disabled={processing.loading}
              onClick={() => void processing.loadMore()}
            >
              More pending images
            </button>
          )}
        </section>
      )}
      {page.items.map((item) => (
        <article className="moderation-row" key={item.id}>
          <div>
            <strong>
              {item.kind} report · @{item.target_username || "deleted account"}
            </strong>
            <p>{item.reason}</p>
            <small>
              Reported by @{item.reporter || "deleted account"} · {item.status}
            </small>
          </div>
          <button
            className="secondary-button"
            onClick={() => setSelected(item)}
          >
            Review report #{item.id}
          </button>
        </article>
      ))}
      {page.loading && <p role="status">Loading reports…</p>}
      {!page.loading && !page.error && !page.items.length && (
        <div className="empty-state">
          <Flag size={28} />
          <h2>No {status === "all" ? "" : status + " "}reports</h2>
          <p>Reports of pins, comments, messages, and accounts appear here.</p>
        </div>
      )}
      {page.error && (
        <button className="secondary-button" onClick={page.reload}>
          Try again
        </button>
      )}
      {page.cursor && (
        <button
          className="secondary-button"
          disabled={page.loading}
          onClick={() => void page.loadMore()}
        >
          More reports
        </button>
      )}
      {selected && (
        <ReviewReport
          report={selected}
          close={() => setSelected(null)}
          done={() => {
            page.reload();
            processing.reload();
          }}
        />
      )}
    </main>
  );
}
export function Moderation() {
  return useAuth().user?.can_moderate ? (
    <ModerationQueue />
  ) : (
    <main className="loading-page">
      <h1>Moderation is restricted</h1>
      <p>This area is available to authorized staff.</p>
      <Link className="secondary-button" to="/">
        Back to feed
      </Link>
    </main>
  );
}
