import { Link } from "react-router-dom";
import { useState } from "react";
import {
  MoreHorizontal,
  CornerUpLeft,
  Pencil,
  Trash2,
  Flag,
} from "lucide-react";
import { Avatar } from "./components";
import type { Msg } from "./Chat";
const emojis = ["❤️", "👍", "😂", "✨", "😮", "😢"];
export default function ChatMessage({
  value: m,
  own,
  grouped,
  last,
  allowed,
  status,
  reply,
  edit,
  remove,
  report,
  react,
  userId,
}: {
  value: Msg;
  own: boolean;
  grouped: boolean;
  last: boolean;
  allowed: boolean;
  status: string;
  userId?: number;
  reply: () => void;
  edit: () => void;
  remove: () => void;
  report: () => void;
  react: (emoji: string) => void;
}) {
  const [above, setAbove] = useState(false);
  return (
    <article
      className={`chat-message ${own ? "own" : ""} ${grouped ? "grouped" : ""}`}
    >
      {!own && (
        <span className="message-avatar">
          {!grouped && (
            <Link
              to={`/u/${m.sender.username}`}
              aria-label={`${m.sender.display_name || m.sender.username}'s profile`}
            >
              <Avatar author={m.sender} size="small" />
            </Link>
          )}
        </span>
      )}
      <div className="message-content">
        {!own && !grouped && (
          <Link className="message-sender" to={`/u/${m.sender.username}`}>
            {m.sender.display_name || m.sender.username}
          </Link>
        )}
        <div className="message-bubble">
          {m.reply && (
            <blockquote>
              <CornerUpLeft size={14} />
              <span>{m.reply.text || "Shared image or pin"}</span>
            </blockquote>
          )}
          {m.deleted ? (
            <em>Message deleted</em>
          ) : (
            <>
              {m.text && <p>{m.text}</p>}
              {m.pin && (
                <Link className="chat-pin" to={`/posts/${m.pin.id}`}>
                  <img src={m.pin.thumbnail} alt="" />
                  <span>
                    <small>Shared pin</small>
                    <strong>{m.pin.title}</strong>
                  </span>
                </Link>
              )}
              {m.attachment && (
                <a href={m.attachment.url} target="_blank" rel="noreferrer">
                  <img
                    className="chat-image"
                    src={m.attachment.url}
                    alt="Shared chat image"
                    loading="lazy"
                  />
                </a>
              )}
            </>
          )}
        </div>
        {m.reactions.length > 0 && (
          <div className="message-reactions" aria-label="Reactions">
            {emojis
              .filter((e) => m.reactions.some((r) => r.emoji === e))
              .map((e) => (
                <button
                  type="button"
                  key={e}
                  disabled={!allowed}
                  aria-label={`React ${e}`}
                  aria-pressed={m.reactions.some(
                    (r) => r.emoji === e && r.user_id === userId,
                  )}
                  onClick={() => react(e)}
                >
                  {e} {m.reactions.filter((r) => r.emoji === e).length}
                </button>
              ))}
          </div>
        )}
        <div className={`message-meta ${last ? "last" : ""}`}>
          <time
            dateTime={m.created_at}
            title={new Date(m.created_at).toLocaleString()}
          >
            {new Date(m.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
          {m.edited_at && <span>· Edited</span>}
          {own && last && !m.deleted && <span>· {status}</span>}
        </div>
      </div>
      {!m.deleted && (
        <details
          className={`message-menu ${above ? "opens-up" : ""}`}
          onToggle={(event) => {
            const menu = event.currentTarget;
            if (menu.open) {
              const edge =
                menu.closest(".chat-timeline")?.getBoundingClientRect()
                  .bottom || window.innerHeight;
              setAbove(menu.getBoundingClientRect().top + 250 > edge);
            }
          }}
        >
          <summary aria-label="Message actions">
            <MoreHorizontal size={18} />
          </summary>
          <div className="message-menu-panel">
            {allowed && (
              <>
                <div className="message-emoji-picker">
                  {emojis.map((e) => (
                    <button
                      type="button"
                      key={e}
                      aria-label={`React ${e}`}
                      onClick={(event) => {
                        react(e);
                        event.currentTarget
                          .closest("details")
                          ?.removeAttribute("open");
                      }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    reply();
                    event.currentTarget
                      .closest("details")
                      ?.removeAttribute("open");
                  }}
                >
                  <CornerUpLeft size={15} />
                  Reply
                </button>
              </>
            )}
            {own ? (
              <>
                {allowed && (
                  <button
                    type="button"
                    onClick={(event) => {
                      edit();
                      event.currentTarget
                        .closest("details")
                        ?.removeAttribute("open");
                    }}
                  >
                    <Pencil size={15} />
                    Edit
                  </button>
                )}
                <button
                  type="button"
                  onClick={(event) => {
                    remove();
                    event.currentTarget
                      .closest("details")
                      ?.removeAttribute("open");
                  }}
                >
                  <Trash2 size={15} />
                  Delete
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={(event) => {
                  report();
                  event.currentTarget
                    .closest("details")
                    ?.removeAttribute("open");
                }}
              >
                <Flag size={15} />
                Report
              </button>
            )}
          </div>
        </details>
      )}
    </article>
  );
}
