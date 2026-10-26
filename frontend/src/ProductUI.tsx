import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  MessageCircle,
  MoreHorizontal,
  Search,
  Share2,
  X,
} from "lucide-react";

export function notify(message: string) {
  window.dispatchEvent(new CustomEvent("behtrest-toast", { detail: message }));
}

export function ToastHost() {
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const show = (event: Event) => {
      if (!(event instanceof CustomEvent) || typeof event.detail !== "string")
        return;
      setNotice(event.detail);
      clearTimeout(timer);
      timer = setTimeout(() => setNotice(""), 5000);
    };
    window.addEventListener("behtrest-toast", show);
    return () => {
      window.removeEventListener("behtrest-toast", show);
      clearTimeout(timer);
    };
  }, []);
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {notice && (
        <div className="toast">
          <Check size={18} />
          <span>{notice}</span>
          <button
            type="button"
            aria-label="Dismiss message"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

export function TagScroller({
  children,
  arrows = true,
}: {
  children: ReactNode;
  arrows?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const element = ref.current!;
    const update = () =>
      setEdges({
        left: element.scrollLeft > 1,
        right:
          element.scrollLeft + element.clientWidth < element.scrollWidth - 1,
      });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.addEventListener("scroll", update);
    update();
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", update);
    };
  }, [children]);
  const scrollable = edges.left || edges.right;
  return (
    <div
      className="tag-scroller"
      data-left={edges.left}
      data-right={edges.right}
    >
      {arrows && scrollable && (
        <button
          className="tag-scroll-arrow"
          type="button"
          aria-label="Scroll tags left"
          disabled={!edges.left}
          onClick={() =>
            ref.current?.scrollBy({ left: -240, behavior: "smooth" })
          }
        >
          <ChevronLeft size={18} />
        </button>
      )}
      <div
        className="filter-chips"
        ref={ref}
        role="region"
        aria-label="Filter by tag"
        tabIndex={0}
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
            return;
          event.preventDefault();
          const buttons = [
            ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
              "button",
            ),
          ];
          const index = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? buttons.length - 1
                : Math.max(
                    0,
                    Math.min(
                      buttons.length - 1,
                      index + (event.key === "ArrowLeft" ? -1 : 1),
                    ),
                  );
          buttons[next]?.focus({ preventScroll: true });
          buttons[next]?.scrollIntoView({
            block: "nearest",
            inline: "nearest",
          });
        }}
      >
        {children}
      </div>
      {arrows && scrollable && (
        <button
          className="tag-scroll-arrow"
          type="button"
          aria-label="Scroll tags right"
          disabled={!edges.right}
          onClick={() =>
            ref.current?.scrollBy({ left: 240, behavior: "smooth" })
          }
        >
          <ChevronRight size={18} />
        </button>
      )}
    </div>
  );
}

export function SearchField({
  value,
  change,
  label,
  placeholder,
}: {
  value: string;
  change: (value: string) => void;
  label: string;
  placeholder?: string;
}) {
  return (
    <label className="product-search">
      <Search size={18} />
      <input
        aria-label={label}
        placeholder={placeholder || label}
        value={value}
        maxLength={100}
        onChange={(e) => change(e.target.value)}
      />
      {value && (
        <button
          type="button"
          aria-label={`Clear ${label.toLowerCase()}`}
          onClick={() => change("")}
        >
          <X size={16} />
        </button>
      )}
    </label>
  );
}

export function ShareControl({
  title,
  path,
  chat,
  compact = false,
}: {
  title: string;
  path: string;
  chat?: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState(false);
  const url = new URL(path, window.location.origin).href;
  return (
    <details
      className={`product-share ${compact ? "pin-more" : ""}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }
      }}
    >
      <summary
        aria-label={compact ? `More actions for ${title}` : `Share ${title}`}
        title={compact ? "More actions" : undefined}
      >
        {compact ? (
          <MoreHorizontal size={20} />
        ) : (
          <>
            <Share2 size={18} />
            <span>Share</span>
          </>
        )}
      </summary>
      <div className="product-share-panel">
        {chat && (
          <Link to={chat}>
            <MessageCircle size={17} />
            Share in chat
          </Link>
        )}
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            } catch {
              setFallback(true);
            }
          }}
        >
          {copied ? <Check size={17} /> : <Copy size={17} />}
          {copied ? "Link copied" : "Copy link"}
        </button>
        {copied && (
          <span role="status" className="sr-only">
            Link copied to clipboard
          </span>
        )}
        {fallback && (
          <label className="share-link-field">
            Copy this link
            <input
              aria-label="Share link"
              readOnly
              value={url}
              onFocus={(e) => e.target.select()}
            />
          </label>
        )}
      </div>
    </details>
  );
}
