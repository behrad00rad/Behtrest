import { useEffect, useRef, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { request } from "./api";
import { useAuth } from "./auth";
import { Avatar, ErrorNotice, message } from "./components";
import type { Author, Page } from "./types";

export function PeopleResults({
  query,
  selected = [],
  choose,
}: {
  query: string;
  selected?: Author[];
  choose: (person: Author) => void;
}) {
  const { user } = useAuth();
  const [people, setPeople] = useState<Author[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const term = query.trim().replace(/^@/, "");
  const currentQuery = useRef(term);
  currentQuery.current = term;
  useEffect(() => {
    const controller = new AbortController();
    setPeople([]);
    setCursor(null);
    setError("");
    setLoading(!!term);
    if (!term) return;
    const timer = setTimeout(() => {
      request<Page<Author>>(
        `/people/?q=${encodeURIComponent(term)}`,
        "GET",
        undefined,
        true,
        controller.signal,
      )
        .then((p) => {
          if (controller.signal.aborted) return;
          setPeople(p.items.filter((p) => p.id !== user?.id));
          setCursor(p.next_cursor);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(message(e));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term, user?.id]);
  async function more() {
    if (!cursor || loading) return;
    const currentTerm = term;
    setLoading(true);
    try {
      const p = await request<Page<Author>>(
        `/people/?q=${encodeURIComponent(term)}&cursor=${encodeURIComponent(cursor)}`,
      );
      if (currentTerm !== currentQuery.current) return;
      setPeople((v) => [
        ...v,
        ...p.items.filter(
          (p) => p.id !== user?.id && !v.some((x) => x.id === p.id),
        ),
      ]);
      setCursor(p.next_cursor);
    } catch (e) {
      if (currentTerm === currentQuery.current) setError(message(e));
    } finally {
      if (currentTerm === currentQuery.current) setLoading(false);
    }
  }
  return (
    <div className="people-results">
      <ErrorNotice error={error} />
      {people.map((person) => (
        <button
          type="button"
          className="person-result"
          key={person.id}
          aria-label={`Choose @${person.username}`}
          aria-pressed={selected.some((p) => p.id === person.id)}
          onClick={() => choose(person)}
        >
          <Avatar author={person} size="small" />
          <span>
            <strong>{person.display_name || person.username}</strong>
            <small>@{person.username}</small>
          </span>
          {selected.some((p) => p.id === person.id) && <Check size={18} />}
        </button>
      ))}
      {loading && (
        <p className="people-status" role="status">
          Finding people…
        </p>
      )}
      {!loading && !error && term && !people.length && (
        <p className="people-status">
          No people found. Try another name or username.
        </p>
      )}
      {!term && (
        <p className="people-status">Find someone by name or @username.</p>
      )}
      {cursor && (
        <button
          type="button"
          className="quiet-button"
          disabled={loading}
          onClick={() => void more()}
        >
          More people
        </button>
      )}
    </div>
  );
}

export function PeoplePicker({
  selected,
  change,
  multiple,
  initialQuery = "",
}: {
  selected: Author[];
  change: (people: Author[]) => void;
  multiple: boolean;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  return (
    <div className="people-picker">
      <label className="messenger-search">
        <Search size={18} />
        <input
          autoFocus
          aria-label="Find people"
          placeholder="Search name or @username"
          maxLength={100}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {!!selected.length && (
        <div className="people-selected">
          {selected.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => change(selected.filter((x) => x.id !== p.id))}
              aria-label={`Remove @${p.username}`}
            >
              <Avatar author={p} size="tiny" />
              {p.display_name || p.username}
              <X size={14} />
            </button>
          ))}
        </div>
      )}
      <PeopleResults
        query={query}
        selected={selected}
        choose={(p) => {
          change(
            selected.some((x) => x.id === p.id)
              ? selected.filter((x) => x.id !== p.id)
              : multiple
                ? [...selected, p]
                : [p],
          );
        }}
      />
    </div>
  );
}
