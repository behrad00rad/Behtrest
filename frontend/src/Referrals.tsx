import { useEffect, useState } from "react";
import { request } from "./api";

type Invite = {
  code: string;
  used: number;
  limit: number;
  remaining: number;
  invite_required: boolean;
};

export default function Referrals() {
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
      </div>
    </section>
  );
}
