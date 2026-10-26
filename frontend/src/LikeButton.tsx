import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { request } from "./api";
import { notify } from "./ProductUI";
import type { Post } from "./types";

const pending = new Set<number>();
type LikeState = { id: number; liked: boolean; like_count: number };
const broadcast = (value: LikeState) =>
  window.dispatchEvent(new CustomEvent("pin-like-changed", { detail: value }));

export default function LikeButton({
  post,
  compact = false,
}: {
  post: Post;
  compact?: boolean;
}) {
  const [state, setState] = useState({
    liked: Boolean(post.liked),
    like_count: post.like_count || 0,
  });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setState({ liked: Boolean(post.liked), like_count: post.like_count || 0 });
  }, [post.id, post.liked, post.like_count]);
  useEffect(() => {
    const update = (event: Event) => {
      if (event instanceof CustomEvent && event.detail.id === post.id)
        setState(event.detail);
    };
    window.addEventListener("pin-like-changed", update);
    return () => window.removeEventListener("pin-like-changed", update);
  }, [post.id]);
  return (
    <button
      type="button"
      className={`like-button ${compact ? "feed-like" : ""}`}
      aria-label={`Like ${post.title}`}
      aria-pressed={state.liked}
      disabled={busy}
      onClick={async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (pending.has(post.id)) return;
        const before = state;
        pending.add(post.id);
        setBusy(true);
        broadcast({
          id: post.id,
          liked: !state.liked,
          like_count: Math.max(0, state.like_count + (state.liked ? -1 : 1)),
        });
        try {
          const result = await request<{ liked: boolean; like_count: number }>(
            `/pins/${post.id}/likes/`,
            state.liked ? "DELETE" : "POST",
            {},
          );
          broadcast({ id: post.id, ...result });
        } catch (error) {
          broadcast({ id: post.id, ...before });
          notify(
            error instanceof Error
              ? error.message
              : "Unable to update your like.",
          );
        } finally {
          pending.delete(post.id);
          setBusy(false);
        }
      }}
    >
      <Heart size={20} fill={state.liked ? "currentColor" : "none"} />
      {!compact && <span>{state.like_count}</span>}
    </button>
  );
}
