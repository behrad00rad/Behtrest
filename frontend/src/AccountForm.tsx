import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, Check, Eye, EyeOff } from "lucide-react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ApiError, request } from "./api";
import type { Session } from "./api";
import { useAuth } from "./auth";
import Art from "./Art";

type Mode = "login" | "register" | "forgot" | "reset";
const content = {
  login: {
    kicker: "YOUR IDEAS ARE WAITING",
    title: "Welcome back.",
    description: "Step into your little corner of inspiration.",
    button: "Sign in",
  },
  register: {
    kicker: "MAKE YOURSELF AT HOME",
    title: "Start something good.",
    description: "A new place for all the things you want to keep.",
    button: "Create account",
  },
  forgot: {
    kicker: "LET’S GET YOU BACK IN",
    title: "Forgot your password?",
    description: "We’ll email you a link to choose a new one.",
    button: "Send reset link",
  },
  reset: {
    kicker: "A FRESH START",
    title: "Choose a new password.",
    description: "Make it something only you know.",
    button: "Save new password",
  },
};

export default function AccountForm({ mode }: { mode: Mode }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const { uid, token } = useParams();
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState("");
  const [inviteRequired, setInviteRequired] = useState(false);
  useEffect(() => {
    if (mode === "register")
      request<{ invite_required: boolean }>("/auth/registration-policy/")
        .then((data) => setInviteRequired(data.invite_required))
        .catch((error) => setError(error));
  }, [mode]);
  if (
    auth.user &&
    (mode === "login" || (mode === "register" && !auth.user.is_guest))
  )
    return <Navigate to="/" replace />;
  const copy = content[mode];
  const registering = mode === "register";
  const resetting = mode === "reset";
  const password = mode !== "forgot";
  const preview = auth.previewMode;
  const previewUrl =
    import.meta.env.VITE_PREVIEW_URL ||
    (import.meta.env.DEV
      ? `${window.location.protocol}//${window.location.hostname}:5175/login`
      : "");

  async function enterPreview() {
    setBusy(true);
    setError(null);
    try {
      const session = await request<Session>("/auth/guest/", "POST", {});
      auth.setUser(session.user);
      navigate("/", { replace: true });
    } catch (error) {
      setError(
        error instanceof ApiError
          ? error
          : new ApiError(
              "unexpected",
              "Unable to start the preview. Please try again.",
            ),
      );
    } finally {
      setBusy(false);
    }
  }

  function fieldErrors(name: string) {
    const messages = error?.fields[name];
    return messages ? (
      <span className="field-error" id={`${name}-error`}>
        {messages.join(" ")}
      </span>
    ) : null;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (mode === "login" || registering) {
        const session = await request<Session>(
          `/auth/${registering ? "register" : "login"}/`,
          "POST",
          fields,
        );
        auth.setUser(session.user);
        navigate("/", { replace: true });
      } else {
        const result = await request<{ message: string }>(
          `/auth/password-reset/${resetting ? "confirm/" : ""}`,
          "POST",
          { ...fields, ...(resetting ? { uid, token } : {}) },
        );
        setDone(result.message);
        if (resetting) auth.setUser(null);
      }
    } catch (error) {
      setError(
        error instanceof ApiError
          ? error
          : new ApiError(
              "unexpected",
              "Something went wrong. Please try again.",
            ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-layout">
      <Art />
      <section className="form-panel">
        <div className="form-wrap">
          <span className="eyebrow">{copy.kicker}</span>
          <h2>
            {preview && registering ? "Make it your playground." : copy.title}
          </h2>
          <p className="form-description">
            {preview
              ? registering
                ? "Just a username and password. No email or invite needed."
                : "A little inspiration, ready to explore. No account needed."
              : copy.description}
          </p>
          {(mode === "login" || registering) && (preview || previewUrl) && (
            <div className="preview-entry">
              {preview ? (
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void enterPreview()}
                  disabled={busy}
                >
                  {busy ? "Opening preview…" : "Explore as a guest"}{" "}
                  <ArrowRight size={18} />
                </button>
              ) : (
                <a className="preview-button" href={previewUrl}>
                  Try the preview <ArrowRight size={18} />
                </a>
              )}
              <p>
                {preview
                  ? "No password, email, or referral code. Just look around."
                  : "Explore sample pins and boards without creating an account."}
              </p>
              {preview && (
                <span className="preview-divider">
                  or{" "}
                  {registering
                    ? "create a preview account"
                    : "sign in to your preview account"}
                </span>
              )}
            </div>
          )}
          {done ? (
            <div className="success-state" role="status">
              <span className="success-icon">
                <Check />
              </span>
              <h3>{resetting ? "You’re all set." : "Check your inbox."}</h3>
              <p>{done}</p>
              <Link className="primary-button" to="/login">
                Back to sign in <ArrowRight size={18} />
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} aria-label={copy.button}>
              {registering && !preview && (
                <label className="field" htmlFor="referral_code">
                  Referral code {inviteRequired ? "(required)" : "(optional)"}
                  <input
                    id="referral_code"
                    name="referral_code"
                    maxLength={32}
                    required={inviteRequired}
                    defaultValue={
                      new URLSearchParams(window.location.search).get("ref") ||
                      ""
                    }
                    autoComplete="off"
                    placeholder="A code from a member"
                    aria-invalid={Boolean(error?.fields.referral_code)}
                  />
                  {inviteRequired && (
                    <span>
                      Behtrest is invite-only. Ask a member for their code.
                    </span>
                  )}
                  {fieldErrors("referral_code")}
                </label>
              )}
              {(registering || mode === "login") && (
                <label className="field" htmlFor="username">
                  Username
                  <input
                    id="username"
                    name="username"
                    autoComplete="username"
                    required
                    maxLength={150}
                    placeholder="Your username"
                    aria-invalid={Boolean(error?.fields.username)}
                    aria-describedby={
                      error?.fields.username ? "username-error" : undefined
                    }
                  />
                  {fieldErrors("username")}
                </label>
              )}
              {((registering && !preview) || mode === "forgot") && (
                <label className="field" htmlFor="email">
                  Email address
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    placeholder="you@example.com"
                    aria-invalid={Boolean(error?.fields.email)}
                    aria-describedby={
                      error?.fields.email ? "email-error" : undefined
                    }
                  />
                  {fieldErrors("email")}
                </label>
              )}
              {password && (
                <label className="field" htmlFor="password">
                  {resetting ? "New password" : "Password"}
                  <span className="password-input">
                    <input
                      id="password"
                      name={
                        registering
                          ? "password1"
                          : resetting
                            ? "new_password1"
                            : "password"
                      }
                      type={visible ? "text" : "password"}
                      required
                      maxLength={1024}
                      minLength={
                        mode === "login" ? undefined : preview ? 6 : 10
                      }
                      autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                      }
                      placeholder={
                        mode === "login"
                          ? "Your password"
                          : preview
                            ? "At least 6 characters"
                            : "At least 10 characters"
                      }
                      aria-describedby={
                        error?.fields[
                          registering
                            ? "password1"
                            : resetting
                              ? "new_password1"
                              : "password"
                        ]
                          ? "password-errors"
                          : undefined
                      }
                    />
                    <button
                      className="password-toggle"
                      type="button"
                      onClick={() => setVisible(!visible)}
                      aria-label={visible ? "Hide password" : "Show password"}
                    >
                      {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </span>
                  <span id="password-errors">
                    {fieldErrors(
                      registering
                        ? "password1"
                        : resetting
                          ? "new_password1"
                          : "password",
                    )}
                  </span>
                </label>
              )}
              {((registering && !preview) || resetting) && (
                <label className="field" htmlFor="confirm-password">
                  Confirm password
                  <input
                    id="confirm-password"
                    name={registering ? "password2" : "new_password2"}
                    type={visible ? "text" : "password"}
                    required
                    maxLength={1024}
                    autoComplete="new-password"
                    placeholder="One more time"
                    aria-invalid={Boolean(
                      error?.fields[
                        registering ? "password2" : "new_password2"
                      ],
                    )}
                  />
                  {fieldErrors(registering ? "password2" : "new_password2")}
                </label>
              )}
              {mode === "login" && !preview && (
                <div className="form-options">
                  <span>A little inspiration, every day.</span>
                  <Link to="/forgot-password">Forgot password?</Link>
                </div>
              )}
              {error && (
                <div className="form-error" role="alert">
                  {error.message}
                  {error.fields.__all__ && (
                    <p>{error.fields.__all__.join(" ")}</p>
                  )}
                </div>
              )}
              <button className="primary-button" type="submit" disabled={busy}>
                {busy ? "One moment…" : copy.button}
                <ArrowRight size={18} />
              </button>
              <p className="form-switch">
                {mode === "login" ? (
                  <>
                    New around here?{" "}
                    <Link to="/register">Create an account</Link>
                  </>
                ) : registering ? (
                  <>
                    Already have an account? <Link to="/login">Sign in</Link>
                  </>
                ) : (
                  <Link to="/login">Back to sign in</Link>
                )}
              </p>
            </form>
          )}
          <div className="form-footnote">
            <span className="tiny-star">✳</span> A home for inspiration. A
            little more you.
          </div>
        </div>
      </section>
    </main>
  );
}
