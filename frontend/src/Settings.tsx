import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "./auth";
import { InterestEditor } from "./Interests";
import { useResource } from "./hooks";
import { ErrorNotice } from "./components";

export default function Settings() {
  const { user, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tags = useResource<{ items: string[] }>("/tags/");
  return (
    <main className="collection-page settings-page">
      <div className="page-heading">
        <div>
          <h1>Settings</h1>
          <p>Make Behtrest feel a little more like you.</p>
        </div>
      </div>
      <section className="settings-section">
        <h2>Your interests</h2>
        <ErrorNotice error={tags.error} />
        {tags.loading ? (
          <p role="status">Loading interests…</p>
        ) : (tags.data?.items.length || 0) >= 3 ? (
          <InterestEditor key={user?.id} tags={tags.data!.items} />
        ) : (
          <p>
            Interests will be available once pins have at least three different
            tags.
          </p>
        )}
      </section>
      <section className="settings-section">
        <h2>Your account</h2>
        <ErrorNotice error={error} />
        <button
          className="secondary-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await signOut();
            } catch {
              setError("Unable to sign out. Please try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Signing out..." : "Sign out"}
        </button>
        {user?.is_guest && (
          <Link className="primary-button" to="/login">
            Sign in to your account
          </Link>
        )}
        <Link className="secondary-button" to={`/u/${user?.username}`}>
          Edit your profile
        </Link>
        <Link className="secondary-button" to="/messages">
          Messaging and privacy
        </Link>
      </section>
    </main>
  );
}
