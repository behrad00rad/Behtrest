import { useState } from "react";
import { Link } from "react-router-dom";
import { ImagePlus, Bookmark } from "lucide-react";
import { usePage } from "./hooks";
import { ErrorNotice } from "./components";
import type { Msg } from "./Chat";
export default function SharedMedia({
  conversation,
  jump,
}: {
  conversation: string;
  jump: (id: number) => void;
}) {
  const [kind, setKind] = useState("all");
  const page = usePage<Msg>(
    `/chat/conversations/${conversation}/media/?kind=${kind}`,
  );
  return (
    <div className="shared-media">
      <div className="tabs">
        {["all", "photos", "pins"].map((value) => (
          <button
            key={value}
            className={value === kind ? "active" : ""}
            aria-pressed={value === kind}
            onClick={() => setKind(value)}
          >
            {value === "all"
              ? "All shared"
              : value === "photos"
                ? "Photos"
                : "Pins"}
          </button>
        ))}
      </div>
      <div className="shared-media-grid">
        {page.items.map((item) => (
          <article className="shared-media-item" key={item.id}>
            {item.attachment && kind !== "pins" && (
              <a href={item.attachment.url} target="_blank" rel="noreferrer">
                <img
                  src={item.attachment.url}
                  alt="Shared photo"
                  loading="lazy"
                />
              </a>
            )}
            {item.pin && kind !== "photos" && (
              <Link to={`/posts/${item.pin.id}`}>
                <img
                  src={item.pin.thumbnail}
                  alt={item.pin.title}
                  loading="lazy"
                />
                <strong>
                  <Bookmark size={13} />
                  {item.pin.title}
                </strong>
              </Link>
            )}
            <small>
              {item.sender.display_name || item.sender.username} ·{" "}
              {new Date(item.created_at).toLocaleDateString([], {
                month: "short",
                day: "numeric",
              })}
            </small>
            <button className="quiet-button" onClick={() => jump(item.id)}>
              Show in conversation
            </button>
          </article>
        ))}
      </div>
      <ErrorNotice error={page.error} />
      {page.loading && (
        <p role="status" className="muted">
          Loading shared items…
        </p>
      )}
      {!page.loading && !page.error && !page.items.length && (
        <div className="empty-state">
          <ImagePlus size={30} />
          <h2>Nothing shared here yet</h2>
          <p>Photos and pins shared in this conversation will appear here.</p>
        </div>
      )}
      {page.error && (
        <button
          className="secondary-button"
          onClick={() => (page.cursor ? void page.loadMore() : page.reload())}
        >
          Try again
        </button>
      )}
      {page.cursor && (
        <button
          className="secondary-button"
          disabled={page.loading}
          onClick={() => void page.loadMore()}
        >
          More shared items
        </button>
      )}
    </div>
  );
}
