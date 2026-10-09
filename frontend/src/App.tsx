import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  LogOut,
  Search as SearchIcon,
  Plus,
  Bookmark,
} from "lucide-react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { Explore, Search, CreatePost, PostDetail } from "./Posts";
import { MyBoards, ProfilePage, BoardDetail } from "./Collections";
import { Avatar } from "./components";
import { useAuth } from "./auth";
import AccountForm from "./AccountForm";

function Header() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
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
        <Link className="wordmark" to="/" aria-label="Bintrest home">
          <span className="brand-mark">b</span>bintrest
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
        <nav aria-label="Main navigation">
          <Link className="story-link" to="/story">
            Our story <ArrowUpRight size={14} />
          </Link>
          {auth.user ? (
            <>
              <Link className="quiet-button" to="/boards">
                <Bookmark size={17} />
                <span className="nav-label">Boards</span>
              </Link>
              <Link className="nav-create" to="/create" aria-label="Create pin">
                <Plus size={18} />
                <span className="nav-label">Create</span>
              </Link>
              <Link to={`/u/${auth.user.username}`} aria-label="Your profile">
                <Avatar
                  author={{
                    username: auth.user.username,
                    display_name: auth.user.profile.display_name,
                    avatar: auth.user.profile.avatar,
                  }}
                  size="small"
                />
              </Link>
              <button
                className="quiet-button"
                onClick={() => void signOut()}
                disabled={busy}
              >
                <LogOut size={16} />
                {busy ? "Signing out…" : "Sign out"}
              </button>
            </>
          ) : (
            <Link className="nav-join" to="/register">
              Join the curious <ArrowRight size={16} />
            </Link>
          )}
        </nav>
      </header>
      {error && (
        <p className="global-error" role="alert">
          {error}
        </p>
      )}
    </>
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
          I’m Amirhossein Ghazanfari Rad. Bintrest began as my CS50x final
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

export default function App() {
  const auth = useAuth();
  const location = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Header />
      <div id="main-content" tabIndex={-1}>
        {auth.loading ? (
          <div className="loading-page" role="status">
            <span className="loading-dot" />
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
          <Routes>
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
      <footer className="site-footer">
        <span>A little space for big ideas.</span>
        <span>Originally made at 13. Still curious.</span>
      </footer>
    </>
  );
}
