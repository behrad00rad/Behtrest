import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Check } from "lucide-react";
import { useAuth } from "./auth";
import { request } from "./api";
import type { User } from "./api";
import { useResource } from "./hooks";
import { ErrorNotice, Modal, message } from "./components";
import { notify } from "./ProductUI";
import { pluralize } from "./format";

export function InterestEditor({
  tags,
  saved,
}: {
  tags: string[];
  saved?: () => void;
}) {
  const auth = useAuth();
  const [selected, setSelected] = useState(auth.user?.profile.interests || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="interest-editor"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
          const result = await request<{ user: User }>(
            "/auth/interests/",
            "PATCH",
            { interests: selected.join(",") },
          );
          auth.setUser(result.user);
          notify("Your interests were saved.");
          saved?.();
        } catch (error) {
          setError(message(error));
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        Pick at least 3 interests. Your Discover feed will start with pins
        matching any of them.
      </p>
      <div
        className="interest-options"
        role="group"
        aria-label="Choose interests"
      >
        {tags.map((tag) => (
          <button
            type="button"
            key={tag}
            aria-pressed={selected.includes(tag)}
            disabled={
              busy || (!selected.includes(tag) && selected.length >= 16)
            }
            onClick={() =>
              setSelected((values) =>
                values.includes(tag)
                  ? values.filter((value) => value !== tag)
                  : [...values, tag],
              )
            }
          >
            {selected.includes(tag) && <Check size={16} />}
            {tag.replaceAll("-", " ")}
          </button>
        ))}
      </div>
      <p role="status">
        {pluralize(selected.length, "interest")} selected · Choose 3–16
      </p>
      <ErrorNotice error={error} />
      <button
        className="primary-button"
        disabled={busy || selected.length < 3 || selected.length > 16}
      >
        {busy ? "Saving…" : "Save interests"}
      </button>
    </form>
  );
}

export function FirstRunInterests() {
  const auth = useAuth();
  const location = useLocation();
  const resource = useResource<{ items: string[] }>("/tags/");
  const [deferred, setDeferred] = useState(false);
  if (
    !auth.user ||
    auth.loading ||
    deferred ||
    (auth.user.profile.interests?.length || 0) >= 3 ||
    (resource.data?.items.length || 0) < 3 ||
    location.pathname === "/settings" ||
    location.pathname === "/register"
  )
    return null;
  return (
    <Modal title="What inspires you?" close={() => setDeferred(true)}>
      <InterestEditor
        key={auth.user.id}
        tags={resource.data!.items}
        saved={() => setDeferred(true)}
      />
      <p className="muted">You can change these anytime in Settings.</p>
    </Modal>
  );
}
