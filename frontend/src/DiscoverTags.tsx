import { useState } from "react";
import { SearchField, TagScroller } from "./ProductUI";
import { Modal } from "./components";

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
  const [open, setOpen] = useState(false);
  const sorted = [
    ...interests.filter((tag) => items.includes(tag)),
    ...items.filter((tag) => !interests.includes(tag)),
  ];
  let featured = sorted.slice(0, 8);
  if (selected && !featured.includes(selected))
    featured = [...featured.slice(0, 7), selected];
  function choose(tag: string) {
    change(tag);
    setOpen(false);
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
      <button
        className="more-tags-button"
        onClick={() => {
          setQuery("");
          setOpen(true);
        }}
      >
        More
      </button>
      {open && (
        <Modal
          title="All tags"
          className="comments-sheet tag-sheet"
          close={() => setOpen(false)}
        >
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
              !sorted.some((tag) =>
                tag.includes(query.trim().toLowerCase()),
              ) && <p>No matching tags.</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}
