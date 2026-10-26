import { useState } from "react";
import { Copy } from "lucide-react";
import { Link } from "react-router-dom";
import { useResource } from "./hooks";
import { useAuth } from "./auth";
import { pluralize } from "./format";
import { notify } from "./ProductUI";
import { ActionPopover } from "./PinActions";
export default function Referrals() {
  const auth = useAuth();
  const resource = useResource<{
    code: string;
    remaining: number;
    enabled: boolean;
  }>("/auth/referrals/");
  const [open, setOpen] = useState(false);
  const invite = resource.data;
  return (
    <section className="profile-invites" aria-label="Your invites">
      <span>
        {invite
          ? `${pluralize(invite.remaining, "invite")} left`
          : resource.error
            ? "Invites unavailable"
            : "Loading invites..."}
      </span>
      <span aria-hidden="true">{String.fromCharCode(183)}</span>
      <ActionPopover
        label="Invite a friend"
        trigger="Invite a friend"
        open={open}
        change={setOpen}
      >
        {invite ? (
          <>
            <div className="invite-code-row">
              <code>{invite.code}</code>
              <button
                className="icon-button"
                aria-label="Copy invite code"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(invite.code);
                    notify("Copied");
                  } catch {
                    notify("Select the code to copy it.");
                  }
                }}
              >
                <Copy size={18} />
              </button>
            </div>
            <p>Share this code with a friend to join Behtrest.</p>
            {!invite.enabled && <p>Invites are currently disabled.</p>}
          </>
        ) : (
          <button onClick={resource.reload}>Try again</button>
        )}
        {auth.user?.can_manage_referrals && (
          <Link to="/settings/referrals">Manage invites</Link>
        )}
      </ActionPopover>
    </section>
  );
}
