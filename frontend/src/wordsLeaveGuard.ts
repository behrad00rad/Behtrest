import { useContext, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { UNSAFE_NavigationContext } from "react-router-dom";
// Register before BrowserRouter mounts: a window-target popstate listener added
// inside the editor can run after the router has already unmounted that editor.
let activePopGuard: ((event: PopStateEvent) => void) | null = null;
const routePop = (event: PopStateEvent) => activePopGuard?.(event);
window.addEventListener("popstate", routePop, true);
if (import.meta.hot)
  import.meta.hot.dispose(() =>
    window.removeEventListener("popstate", routePop, true),
  );

export function useWordsLeaveGuard(
  dirty: boolean,
  published: RefObject<boolean>,
  flush: () => void,
) {
  const { navigator } = useContext(UNSAFE_NavigationContext);
  const [asking, setAsking] = useState(false);
  const pending = useRef<null | (() => void)>(null);
  const current = useRef({ dirty, flush });
  current.current = { dirty, flush };
  useLayoutEffect(() => {
    const push = navigator.push.bind(navigator),
      replace = navigator.replace.bind(navigator),
      go = navigator.go.bind(navigator);
    function confirm(run: () => void) {
      if (!current.current.dirty || published.current) {
        run();
        return;
      }
      current.current.flush();
      pending.current = run;
      setAsking(true);
    }
    const guardedPush: typeof navigator.push = (...args) =>
      confirm(() => push(...args));
    const guardedReplace: typeof navigator.replace = (...args) =>
      confirm(() => replace(...args));
    const guardedGo: typeof navigator.go = (...args) =>
      confirm(() => go(...args));
    navigator.push = guardedPush;
    navigator.replace = guardedReplace;
    navigator.go = guardedGo;
    const unload = (event: BeforeUnloadEvent) => {
      if (current.current.dirty && !published.current) {
        current.current.flush();
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    // Back/Forward is browser-driven rather than navigator.go. Restore the current
    // entry, then replay the requested delta only after confirmation.
    let index = window.history.state?.idx ?? 0;
    let restoring = false;
    const pop = (event: PopStateEvent) => {
      const next = window.history.state?.idx ?? index;
      const delta = next - index;
      if (restoring) {
        restoring = false;
        event.stopImmediatePropagation();
        return;
      }
      if (current.current.dirty && !published.current && delta) {
        event.stopImmediatePropagation();
        current.current.flush();
        restoring = true;
        window.history.go(-delta);
        pending.current = () => {
          published.current = true;
          window.history.go(delta);
        };
        setAsking(true);
      } else index = next;
    };
    activePopGuard = pop;
    return () => {
      if (navigator.push === guardedPush) navigator.push = push;
      if (navigator.replace === guardedReplace) navigator.replace = replace;
      if (navigator.go === guardedGo) navigator.go = go;
      window.removeEventListener("beforeunload", unload);
      if (activePopGuard === pop) activePopGuard = null;
    };
  }, [navigator, published]);
  return {
    asking,
    stay: () => {
      pending.current = null;
      setAsking(false);
    },
    leave: () => {
      setAsking(false);
      const run = pending.current;
      pending.current = null;
      run?.();
    },
  };
}
