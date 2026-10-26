import { Link } from "react-router-dom";
import { useAuth } from "./auth";
import { InterestEditor } from "./Interests";
import { useResource } from "./hooks";
import { ErrorNotice } from "./components";

export default function Settings() {
  const { user } = useAuth();
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
