import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { request } from "./api";
import { useAuth } from "./auth";

type Policy = { invite_required: boolean; referrals_per_user: number };
type Member = {
  id: number;
  username: string;
  active: boolean;
  code: string;
  used: number;
  enabled: boolean;
  allowance_override: number | null;
};

function MemberInvites({
  member,
  reload,
}: {
  member: Member;
  reload: () => void;
}) {
  const [enabled, setEnabled] = useState(member.enabled);
  const [limit, setLimit] = useState(
    member.allowance_override?.toString() || "",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [rotating, setRotating] = useState(false);
  async function save(event?: FormEvent, regenerate = false) {
    event?.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await request(
        `/auth/admin/referrals/members/${member.id}/`,
        "PATCH",
        regenerate
          ? { regenerate: true }
          : {
              enabled,
              allowance_override: limit === "" ? null : Number(limit),
            },
      );
      setMessage(
        regenerate
          ? "Code replaced. Previous links no longer work."
          : "Invite controls saved.",
      );
      setRotating(false);
      reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="invite-member">
      <h3>
        @{member.username}
        {!member.active && " · suspended"}
      </h3>
      <p>
        {member.used} successful invitations · <code>{member.code}</code>
      </p>
      <form onSubmit={(event) => void save(event)}>
        <label>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />{" "}
          Allow this member to invite
        </label>
        <label className="field">
          Personal allowance
          <input
            type="number"
            min={0}
            max={10000}
            step={1}
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
            placeholder="Use global allowance"
          />
        </label>
        <p>
          Leave empty to use the global allowance. Spent invites stay spent.
        </p>
        <div className="invite-actions">
          <button className="primary-button" disabled={busy}>
            Save member
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={busy}
            onClick={() => setRotating(true)}
          >
            Replace code
          </button>
        </div>
      </form>
      {rotating && (
        <div className="image-check">
          <p>
            Replace this code? Existing invite links will stop working; usage
            stays the same.
          </p>
          <div className="invite-actions">
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => void save(undefined, true)}
            >
              Replace now
            </button>
            <button
              className="quiet-button"
              disabled={busy}
              onClick={() => setRotating(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <p role="status">{message}</p>
    </article>
  );
}

export default function ReferralSettings() {
  const { user } = useAuth();
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [next, setNext] = useState<number | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    if (user?.can_manage_referrals)
      request<Policy>(
        "/auth/admin/referrals/settings/",
        "GET",
        undefined,
        true,
        abort.signal,
      )
        .then((data) => {
          if (!abort.signal.aborted) setPolicy((current) => current || data);
        })
        .catch((error) => {
          if (!abort.signal.aborted) setError(error.message);
        });
    return () => abort.abort();
  }, [user?.can_manage_referrals]);
  useEffect(() => {
    if (!user?.can_manage_referrals) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      request<{ items: Member[]; next_page: number | null }>(
        `/auth/admin/referrals/members/?q=${encodeURIComponent(query)}&page=${page}`,
        "GET",
        undefined,
        true,
        abort.signal,
      )
        .then((data) => {
          setMembers(data.items);
          setNext(data.next_page);
        })
        .catch((error) => {
          if (!abort.signal.aborted) setError(error.message);
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query, page, version, user?.can_manage_referrals]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!policy) return;
    setBusy(true);
    setMessage("");
    try {
      setPolicy(
        await request<Policy>(
          "/auth/admin/referrals/settings/",
          "PATCH",
          policy,
        ),
      );
      setMessage("Registration settings saved.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  if (!user?.can_manage_referrals)
    return (
      <main className="loading-page">
        <h1>Administrator access required</h1>
        <Link to="/">Back home</Link>
      </main>
    );
  return (
    <main className="collection-page product-page referral-settings">
      <h1>Invites & registration</h1>
      <p>
        Control who can join. Existing members continue signing in normally.
      </p>
      {error && <p role="alert">{error}</p>}
      {policy && (
        <section className="invite-member">
          <h2>Registration settings</h2>
          <form onSubmit={(event) => void save(event)}>
            <label>
              <input
                type="checkbox"
                checked={policy.invite_required}
                onChange={(event) =>
                  setPolicy({
                    ...policy,
                    invite_required: event.target.checked,
                  })
                }
              />{" "}
              Require an invite to create an account
            </label>
            <label className="field">
              Invites per member
              <input
                type="number"
                min={0}
                max={10000}
                required
                value={policy.referrals_per_user}
                onChange={(event) =>
                  setPolicy({
                    ...policy,
                    referrals_per_user: Number(event.target.value),
                  })
                }
              />
            </label>
            <p>
              Lifetime successful signups. Personal allowances override this
              setting.
            </p>
            <button className="primary-button" disabled={busy}>
              {busy ? "Saving…" : "Save registration settings"}
            </button>
            <p role="status">{message}</p>
          </form>
        </section>
      )}
      <h2>Member invites</h2>
      <label className="field">
        Find a member
        <input
          type="search"
          value={query}
          maxLength={150}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          placeholder="Username or display name"
        />
      </label>
      {loading ? (
        <p role="status">Loading members…</p>
      ) : (
        <>
          {members.map((member) => (
            <MemberInvites
              key={`${member.id}:${member.code}:${member.enabled}:${member.allowance_override}`}
              member={member}
              reload={() => setVersion((value) => value + 1)}
            />
          ))}
          {!members.length && <p>No matching members.</p>}
          <div className="invite-actions">
            <button
              className="secondary-button"
              disabled={page === 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </button>
            <span>Page {page}</span>
            <button
              className="secondary-button"
              disabled={!next}
              onClick={() => next && setPage(next)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </main>
  );
}
