import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, LogOut, Sparkles } from "lucide-react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { request } from "./api";
import { useAuth } from "./auth";
import AccountForm from "./AccountForm";

function Header() {
  const auth = useAuth();
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
        <nav aria-label="Main navigation">
          <Link className="story-link" to="/story">
            Our story <ArrowUpRight size={14} />
          </Link>
          {auth.user ? (
            <>
              <span className="nav-user">@{auth.user.username}</span>
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

function Home() {
  const { user } = useAuth();
  const [health, setHealth] = useState<"checking" | "ok" | "error">("checking");
  useEffect(() => {
    let active = true;
    request<{ status: string }>("/health/")
      .then(() => {
        if (active) setHealth("ok");
      })
      .catch(() => {
        if (active) setHealth("error");
      });
    return () => {
      active = false;
    };
  }, []);
  if (!user) return <Navigate to="/login" replace />;
  return (
    <main className="workspace">
      <div className="welcome-row">
        <div>
          <span className="eyebrow">YOUR LITTLE CORNER</span>
          <h1>
            Hello, {user.profile.display_name || user.username}
            <span className="brand-dot">.</span>
          </h1>
          <p>Good to have you here. Let’s make room for a few good ideas.</p>
        </div>
        <span className="avatar" aria-label={`Account ${user.username}`}>
          {(user.profile.display_name || user.username)
            .slice(0, 1)
            .toUpperCase()}
        </span>
      </div>
      <section className="workspace-card">
        <div className="workspace-art" aria-hidden="true">
          <span className="floating-shape shape-one" />
          <span className="floating-shape shape-two" />
          <Sparkles size={35} />
        </div>
        <div>
          <span className="eyebrow">A NEW CHAPTER</span>
          <h2>
            Your next idea
            <br />
            starts here.
          </h2>
          <p>
            We’re making a home for your collections.
            <br />
            For now, your account is ready and waiting.
          </p>
          <Link className="text-link" to="/story">
            See where it all began <ArrowUpRight size={18} />
          </Link>
        </div>
      </section>
      <div className="account-strip">
        <span>
          Signed in as <strong>@{user.username}</strong>
        </span>
        <span>{user.email}</span>
        <span className={`service-status ${health}`} role="status">
          <i />
          {health === "ok"
            ? "All connected"
            : health === "checking"
              ? "Checking connection…"
              : "Connection unavailable"}
        </span>
      </div>
    </main>
  );
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
            <Route path="/" element={<Home />} />
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
