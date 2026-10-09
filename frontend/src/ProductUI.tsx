import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Copy, MessageCircle, Search, Share2, X } from "lucide-react";

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
}: {
  title: string;
  path: string;
  chat?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState(false);
  const url = new URL(path, window.location.origin).href;
  return (
    <details className="product-share">
      <summary aria-label={`Share ${title}`}>
        <Share2 size={18} />
        <span>Share</span>
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
