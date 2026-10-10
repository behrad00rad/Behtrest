import { useEffect, useState } from "react";
import { request } from "./api";
import { Link } from "react-router-dom";
import { useAuth } from "./auth";

type Invite = {
  code: string;
  used: number;
  limit: number;
  remaining: number;
  invite_required: boolean;
  enabled: boolean;
};

export default function Referrals() {
  const auth = useAuth();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    request<Invite>("/auth/referrals/")
      .then(setInvite)
      .catch((error) => setMessage(error.message));
  }, []);
  async function copy() {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/register?ref=${encodeURIComponent(invite.code)}`,
      );
      setMessage("Invite link copied.");
    } catch {
      setMessage("Copy the code below and share it with your friend.");
    }
  }
  return (
    <section className="image-check" aria-label="Your invites">
      <div>
        <h3>Invite friends</h3>
        {auth.user?.can_manage_referrals && (
          <Link className="text-link" to="/settings/referrals">
            Manage invites
          </Link>
        )}
        {invite && (
          <>
            <p>
              {invite.remaining} invites remaining · {invite.used} used of{" "}
              {invite.limit}
            </p>
            <p>
              <code>{invite.code}</code>
            </p>
            <button
              className="secondary-button"
              onClick={() => void copy()}
              disabled={!invite.remaining}
            >
              Copy invite link
            </button>
          </>
        )}
        <p role="status">
          {message ||
            (!invite
              ? "Loading invites…"
              : "Share your code with someone you want to invite.")}
        </p>
        {invite && !invite.enabled && (
          <p>
            Invites are disabled for your account. Contact an administrator.
          </p>
        )}
      </div>
    </section>
  );
}
