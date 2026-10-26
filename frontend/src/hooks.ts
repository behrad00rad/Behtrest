import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "./api";
import type { Page } from "./types";

export function useDebouncedValue<T>(value: T, delay = 250) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

export function useResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const previousPath = useRef(path);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    if (previousPath.current !== path) setData(null);
    previousPath.current = path;
    request<T>(path, "GET", undefined, true, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, version]);
  return {
    data,
    setData,
    loading,
    error,
    reload: () => setVersion((value) => value + 1),
  };
}

export function usePage<T extends { id: number }>(
  path: string,
  keepPrevious = false,
) {
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const generation = useRef(0);
  const busy = useRef(false);
  const nextRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    nextRequest.current?.abort();
    busy.current = true;
    if (!keepPrevious) setItems([]);
    setCursor(null);
    setLoading(true);
    setError("");
    request<Page<T>>(path, "GET", undefined, true, controller.signal)
      .then((page) => {
        if (generation.current === current) {
          setItems(page.items);
          setCursor(page.next_cursor);
        }
      })
      .catch((error) => {
        if (generation.current === current && !controller.signal.aborted)
          setError(error.message);
      })
      .finally(() => {
        if (generation.current === current) {
          busy.current = false;
          setLoading(false);
        }
      });
    return () => {
      ++generation.current;
      controller.abort();
      nextRequest.current?.abort();
    };
  }, [path, version, keepPrevious]);

  const loadMore = useCallback(async () => {
    if (busy.current || !cursor) return;
    busy.current = true;
    setLoading(true);
    setError("");
    const current = generation.current;
    const controller = new AbortController();
    nextRequest.current = controller;
    try {
      const page = await request<Page<T>>(
        `${path}${path.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(cursor)}`,
        "GET",
        undefined,
        true,
        controller.signal,
      );
      if (generation.current === current) {
        setItems((previous) => {
          const seen = new Set(previous.map((item) => item.id));
          return [
            ...previous,
            ...page.items.filter((item) => !seen.has(item.id)),
          ];
        });
        setCursor(page.next_cursor);
      }
    } catch (error) {
      if (generation.current === current && !controller.signal.aborted)
        setError(
          error instanceof Error ? error.message : "Unable to load more.",
        );
    } finally {
      if (generation.current === current) {
        busy.current = false;
        setLoading(false);
      }
    }
  }, [path, cursor]);
  return {
    items,
    setItems,
    cursor,
    loading,
    error,
    loadMore,
    reload: () => setVersion((value) => value + 1),
  };
}
