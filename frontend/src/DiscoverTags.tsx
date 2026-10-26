import { useEffect, useRef, useState } from "react";
import { SearchField, TagScroller } from "./ProductUI";

export default function DiscoverTags({
  items,
  interests,
  selected,
  change,
}: {
  items: string[];
  interests: string[];
  selected: string;
  change: (tag: string) => void;
}) {
  const [query, setQuery] = useState("");
  const more = useRef<HTMLDetailsElement>(null);
  const sorted = [
    ...interests.filter((tag) => items.includes(tag)),
    ...items.filter((tag) => !interests.includes(tag)),
  ];
  let featured = sorted.slice(0, 8);
  if (selected && !featured.includes(selected))
    featured = [...featured.slice(0, 7), selected];
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (
        more.current &&
        event.target instanceof Node &&
        !more.current.contains(event.target)
      )
        more.current.open = false;
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  function choose(tag: string) {
    change(tag);
    if (more.current?.open) {
      more.current.open = false;
      more.current.querySelector("summary")?.focus();
    }
  }
  const chip = (tag: string) => (
    <button
      key={tag || "all"}
      type="button"
      className={selected === tag ? "active" : ""}
      aria-pressed={selected === tag}
      onClick={() => choose(tag)}
    >
      {tag ? tag.replaceAll("-", " ") : "All pins"}
    </button>
  );
  return (
    <div className="discover-tag-choices">
      <TagScroller arrows={false}>
        {chip("")}
        {featured.map(chip)}
      </TagScroller>
      <details
        className="more-tags"
        ref={more}
        onToggle={(event) => {
          if (event.currentTarget.open) {
            setQuery("");
            event.currentTarget.querySelector("input")?.focus();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.currentTarget.open = false;
            event.currentTarget.querySelector("summary")?.focus();
          }
        }}
      >
        <summary aria-label="More tags">More</summary>
        <div className="tag-popover" role="region" aria-label="All tags">
          <SearchField value={query} change={setQuery} label="Search tags" />
          <div
            className="all-tag-options"
            role="group"
            aria-label="Choose one tag"
          >
            {chip("")}
            {sorted
              .filter((tag) => tag.includes(query.trim().toLowerCase()))
              .map(chip)}
          </div>
          {query &&
            !sorted.some((tag) => tag.includes(query.trim().toLowerCase())) && (
              <p>No matching tags.</p>
            )}
        </div>
      </details>
    </div>
  );
}
