import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  LogOut,
  Search as SearchIcon,
  Plus,
  Bookmark,
  House,
  MessageCircle,
  UserRound,
  X,
} from "lucide-react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { Explore, Search, CreatePost, PostDetail } from "./Posts";
import { MyBoards, ProfilePage, BoardDetail } from "./Collections";
import { Avatar, Modal } from "./components";
import { useAuth } from "./auth";
import AccountForm from "./AccountForm";
import ReferralSettings from "./ReferralSettings";
import Chat from "./Chat";
import { useChat } from "./ChatContext";
import { ActivityNav, Notifications, Moderation } from "./Community";
import Settings from "./Settings";
import { ToastHost } from "./ProductUI";
import { FirstRunInterests } from "./Interests";
import Owl, { LogoOwl } from "./Owl";
import { MotionLayer } from "./PlayfulMotion";

function Header() {
  const chat = useChat();
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const accountMenu = useRef<HTMLDetailsElement>(null);
  const logoClicks = useRef<number[]>([]);
  useEffect(() => {
    document.documentElement.classList.remove("header-hidden");
    if (!["/", "/search"].includes(location.pathname)) return;
    let last = Math.max(0, window.scrollY);
    const scroll = () => {
      const y = Math.max(0, window.scrollY);
      if (y > 0 && Math.abs(y - last) < 8) return;
      document.documentElement.classList.toggle(
        "header-hidden",
        y > last && y > 100,
      );
      last = y;
    };
    window.addEventListener("scroll", scroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", scroll);
      document.documentElement.classList.remove("header-hidden");
    };
  }, [location.pathname]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !accountMenu.current?.contains(event.target) &&
        accountMenu.current
      )
        accountMenu.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && accountMenu.current?.open) {
        accountMenu.current.open = false;
        accountMenu.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  useEffect(() => {
    if (accountMenu.current) accountMenu.current.open = false;
  }, [location.pathname]);
  const [query, setQuery] = useState(
    new URLSearchParams(location.search).get("q") || "",
  );
  useEffect(() => {
    setQuery(new URLSearchParams(location.search).get("q") || "");
  }, [location.search]);
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    setBusy(true);
    setError("");
    try {
      await auth.signOut();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to sign out.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="site-header">
        <Link
          className="wordmark"
          to="/"
          aria-label="Behtrest home"
          onClick={() => {
            const now = performance.now();
            logoClicks.current = [
              ...logoClicks.current.filter((time) => now - time < 3000),
              now,
            ];
            if (logoClicks.current.length >= 5) {
              logoClicks.current = [];
              window.dispatchEvent(new Event("owl-flight"));
            }
          }}
        >
          <span className="brand-mark brand-owl">
            <LogoOwl />
          </span>
          behtrest
          <span className="brand-dot">.</span>
        </Link>
        {auth.user && (
          <form className="header-search" onSubmit={search} role="search">
            <SearchIcon size={18} />
            <input
              aria-label="Search pins and people"
              placeholder="Find a little inspiration…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              maxLength={100}
            />
            <button aria-label="Search" type="submit">
              <ArrowRight size={17} />
            </button>
          </form>
        )}
        {auth.user && <ActivityNav />}
        <nav aria-label="Main navigation">
          {auth.user ? (
            <>
              <NavLink
                className="quiet-button header-icon"
                title="Messages"
                to="/messages"
                aria-label="Messages"
              >
                <MessageCircle size={17} />

                {chat.unread + chat.requests > 0 && (
                  <b className="chat-badge">{chat.unread + chat.requests}</b>
                )}
              </NavLink>
              <NavLink
                className="quiet-button header-icon"
                title="Boards"
                to="/boards"
                aria-label="Your boards"
              >
                <Bookmark size={17} />
              </NavLink>
              <Link className="nav-create" to="/create" aria-label="Create pin">
                <Plus size={18} />
                <span className="nav-label">Create</span>
              </Link>
            </>
          ) : (
            <Link className="nav-join" to="/register">
              Join the curious <ArrowRight size={16} />
            </Link>
          )}
        </nav>
        {auth.user && (
          <details
            ref={accountMenu}
            className="mobile-account-menu account-menu"
            onKeyDown={(event) => {
              if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
                return;
              event.preventDefault();
              event.currentTarget.open = true;
              const items = [
                ...event.currentTarget.querySelectorAll<HTMLElement>(
                  "a, button",
                ),
              ];
              const index = items.indexOf(
                document.activeElement as HTMLElement,
              );
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? items.length - 1
                    : (index +
                        (event.key === "ArrowUp" ? -1 : 1) +
                        items.length) %
                      items.length;
              items[next]?.focus();
            }}
          >
            <summary aria-label="Account menu">
              <Avatar
                author={{
                  username: auth.user.username,
                  display_name: auth.user.profile.display_name,
                  avatar: auth.user.profile.avatar,
                }}
                size="small"
              />
            </summary>
            <div>
              <Link to="/notifications">Notifications</Link>
              {auth.user.can_moderate && (
                <Link to="/moderation">Moderation</Link>
              )}
              <Link to={`/u/${auth.user.username}`}>Your profile</Link>
              <Link to="/settings">Settings</Link>
              {auth.user.is_guest && <Link to="/login">Sign in</Link>}
              <Link to="/story">Our story</Link>
              <button disabled={busy} onClick={() => void signOut()}>
                <LogOut size={15} />
                {busy ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </details>
        )}
      </header>
      {error && (
        <p className="global-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function MobileNavigation() {
  const auth = useAuth();
  const chat = useChat();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const location = useLocation();
  if (
    !auth.user ||
    ["/login", "/register", "/forgot-password"].includes(location.pathname)
  )
    return null;
  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      <NavLink to="/" end aria-label="Home">
        <House size={19} />
        <span>Home</span>
      </NavLink>
      <NavLink to="/messages" aria-label="Messages">
        <span className="mobile-nav-icon">
          <MessageCircle size={19} />
          {chat.unread + chat.requests > 0 && (
            <b className="chat-badge">{chat.unread + chat.requests}</b>
          )}
        </span>
        <span>Messages</span>
      </NavLink>
      <NavLink
        to="/create"
        aria-label="Create pin"
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || creating) return;
          event.preventDefault();
          setCreating(true);
          setTimeout(
            () => {
              navigate("/create");
              setCreating(false);
            },
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
              ? 0
              : 200,
          );
        }}
      >
        <span className="mobile-nav-create">
          <Owl state={creating ? "blink" : "idle"} />
        </span>
        <span>Create</span>
      </NavLink>
      <NavLink to="/boards" aria-label="Your boards">
        <Bookmark size={19} />
        <span>Boards</span>
      </NavLink>
      <NavLink to={`/u/${auth.user.username}`} aria-label="Your profile">
        <UserRound size={19} />
        <span>Profile</span>
      </NavLink>
    </nav>
  );
}

function PreviewBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem("behtrest-preview-banner-dismissed") === "1";
    } catch {
      return false;
    }
  });
  if (dismissed) return null;
  return (
    <aside className="preview-banner" aria-label="Preview notice">
      <strong>{user?.is_guest ? "Guest preview" : "Preview playground"}</strong>
      <span className="preview-description">Sample content only.</span>
      {user?.is_guest && (
        <>
          <span className="guest-badge">Guest</span>
          <Link to="/register">Create account</Link>
          <Link to="/login">Sign in</Link>
        </>
      )}
      <button
        type="button"
        aria-label="Dismiss preview notice"
        onClick={() => {
          setDismissed(true);
          try {
            localStorage.setItem("behtrest-preview-banner-dismissed", "1");
          } catch {
            /* Dismiss for this visit if storage is unavailable. */
          }
        }}
      >
        <X size={16} />
      </button>
    </aside>
  );
}

function Protected({ children }: { children: ReactNode }) {
  return useAuth().user ? children : <Navigate to="/login" replace />;
}

function Story() {
  return (
    <main className="story-page">
      <span className="eyebrow">A PROJECT THAT GREW UP WITH ME</span>
      <h1>
        It started with
        <br />
        <em>a little blue.</em>
      </h1>
      <p className="story-lead">
        At 13, I wanted a dark theme for Pinterest. Blue was my favorite color.
        So I made my own.
      </p>
      <div className="story-body">
        <p>
          I’m Amirhossein Ghazanfari Rad. Behtrest began as my CS50x final
          project: a place to share pictures, leave comments, and learn how the
          pieces of a web application fit together.
        </p>
        <p>
          It wasn’t perfect. Some buttons were just ideas, and the infinite
          scrolling was a little too infinite. But it was mine, and it taught me
          how to turn something I wanted into something I could build.
        </p>
        <p>
          Now I’m returning to it with what I’ve learned since. The dark theme
          and blue stay. The original project stays too, as a record of where it
          began.
        </p>
        <a
          className="text-link"
          href="https://youtu.be/EODyZn-WkIM"
          target="_blank"
          rel="noreferrer"
        >
          Watch the original demo <ArrowUpRight size={18} />
        </a>
        <p className="story-thanks">
          With thanks to Harvard’s CS50x, the CS50x Rasht team, and Mr.
          Tavasoli.
        </p>
      </div>
      <Link className="primary-button" to="/">
        Make yourself at home <ArrowRight size={18} />
      </Link>
    </main>
  );
}

function PinOverlay() {
  const location = useLocation();
  const navigate = useNavigate();
  const feedScroll = useRef(location.state?.feedScroll ?? window.scrollY);
  useEffect(() => {
    const previous = document.body.style.overflow;
    const restoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
      requestAnimationFrame(() => {
        window.scrollTo(0, feedScroll.current);
        requestAnimationFrame(() => {
          window.history.scrollRestoration = restoration;
        });
      });
    };
  }, []);
  const positions = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const dialog = document.querySelector(".pin-detail-dialog");
    if (!dialog) return;
    const target = positions.current.get(location.key) || 0;
    let restoring = target > 0;
    const restore = () => {
      if (!restoring) return;
      dialog.scrollTo(0, target);
      if (Math.abs(dialog.scrollTop - target) < 2) restoring = false;
    };
    dialog.scrollTo(0, target);
    const observer = new MutationObserver(restore);
    observer.observe(dialog, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style"],
    });
    const timer = setTimeout(() => {
      restoring = false;
      observer.disconnect();
    }, 3000);
    const remember = () => {
      if (!restoring) positions.current.set(location.key, dialog.scrollTop);
    };
    dialog.addEventListener("scroll", remember, { passive: true });
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      dialog.removeEventListener("scroll", remember);
    };
  }, [location.key]);
  const close = () =>
    navigate(
      -Math.max(
        1,
        window.history.state?.usr?.pinDepth || location.state?.pinDepth || 1,
      ),
    );
  return (
    <Modal title="Pin details" className="pin-detail-dialog" close={close}>
      <PostDetail key={location.pathname} onBack={close} />
      <MobileNavigation />
    </Modal>
  );
}

export default function App() {
  const auth = useAuth();
  const location = useLocation();
  const background = location.pathname.startsWith("/pin/")
    ? location.state?.backgroundLocation
    : undefined;
  const wasOverlay = useRef(false);
  const top = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = top.current!;
    const observer = new ResizeObserver(() =>
      shell.current?.style.setProperty(
        "--app-top-height",
        `${element.getBoundingClientRect().height}px`,
      ),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const previous = wasOverlay.current;
    wasOverlay.current = Boolean(background);
    if (background || previous) return;
    window.scrollTo(0, 0);
    document.getElementById("main-content")?.focus({ preventScroll: true });
  }, [location.pathname, background]);
  return (
    <div
      ref={shell}
      className={`app-shell ${location.pathname.startsWith("/messages") ? "is-messaging" : ""}`}
    >
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="app-top" ref={top}>
        <Header />
        {auth.previewMode && <PreviewBanner />}
      </div>
      <MobileNavigation />
      <ToastHost />
      <MotionLayer />
      <FirstRunInterests key={auth.user?.id || "anonymous"} />
      <div
        id="main-content"
        className={
          location.pathname.startsWith("/messages")
            ? "page-container messaging-content"
            : "page-container"
        }
        tabIndex={-1}
      >
        {auth.loading ? (
          <div className="loading-page" role="status">
            <Owl state="think" />
            Making a little room…
          </div>
        ) : auth.error ? (
          <div className="loading-page">
            <p role="alert">{auth.error}</p>
            <button
              className="primary-button"
              onClick={() => void auth.refresh()}
            >
              Try again <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          <Routes location={background || location}>
            <Route
              path="/settings"
              element={
                <Protected>
                  <Settings />
                </Protected>
              }
            />
            <Route
              path="/settings/referrals"
              element={
                <Protected>
                  <ReferralSettings />
                </Protected>
              }
            />
            <Route
              path="/notifications"
              element={
                <Protected>
                  <Notifications />
                </Protected>
              }
            />
            <Route
              path="/moderation"
              element={
                <Protected>
                  <Moderation />
                </Protected>
              }
            />
            <Route
              path="/messages"
              element={
                <Protected>
                  <Chat />
                </Protected>
              }
            />
            <Route
              path="/messages/:id"
              element={
                <Protected>
                  <Chat />
                </Protected>
              }
            />
            <Route
              path="/"
              element={
                <Protected>
                  <Explore />
                </Protected>
              }
            />
            <Route
              path="/search"
              element={
                <Protected>
                  <Search />
                </Protected>
              }
            />
            <Route
              path="/create"
              element={
                <Protected>
                  <CreatePost />
                </Protected>
              }
            />
            <Route
              path="/pin/:id"
              element={
                <Protected>
                  <PostDetail key={location.pathname} />
                </Protected>
              }
            />
            <Route
              path="/posts/:id"
              element={
                <Protected>
                  <PostDetail key={location.pathname} />
                </Protected>
              }
            />
            <Route
              path="/boards"
              element={
                <Protected>
                  <MyBoards />
                </Protected>
              }
            />
            <Route
              path="/boards/:id"
              element={
                <Protected>
                  <BoardDetail key={location.pathname} />
                </Protected>
              }
            />
            <Route
              path="/u/:username"
              element={
                <Protected>
                  <ProfilePage key={location.pathname} />
                </Protected>
              }
            />
            <Route
              path="/login"
              element={<AccountForm key="login" mode="login" />}
            />
            <Route
              path="/register"
              element={<AccountForm key="register" mode="register" />}
            />
            <Route
              path="/forgot-password"
              element={<AccountForm key="forgot" mode="forgot" />}
            />
            <Route
              path="/reset-password/:uid/:token"
              element={<AccountForm key={location.pathname} mode="reset" />}
            />
            <Route path="/story" element={<Story />} />
            <Route
              path="*"
              element={
                <main className="loading-page">
                  <h1>A little off the path.</h1>
                  <p>We couldn’t find that page.</p>
                  <Link className="text-link" to="/">
                    Back home <ArrowRight size={18} />
                  </Link>
                </main>
              }
            />
          </Routes>
        )}
      </div>
      {background && (
        <Routes>
          <Route
            path="/pin/:id"
            element={
              <Protected>
                <PinOverlay />
              </Protected>
            }
          />
        </Routes>
      )}
      <footer
        className={`site-footer ${location.pathname.startsWith("/messages") ? "messaging-footer" : ""}`}
      >
        <span>A little space for big ideas.</span>
        <span>Originally made at 13. Still curious.</span>
      </footer>
    </div>
  );
}
