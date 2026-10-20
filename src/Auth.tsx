import { useEffect, useState } from "react";
import { ArrowRight, ShieldCheck, LockKeyhole } from "lucide-react";
import { request, setCsrf } from "./api";
import { Logo } from "./components";
export default function Auth({ onLogin }: { onLogin: (user: any) => void }) {
  const hash = new URLSearchParams(location.hash.slice(1));
  const invite = hash.get("setup") || hash.get("invite"),
    reset = hash.get("reset");
  const ownerSetup = hash.has("setup");
  const [mode, setMode] = useState(
      reset ? "reset" : invite ? "register" : "login",
    ),
    [status, setStatus] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    request("/auth/status")
      .then(setStatus)
      .catch((e) => setError(e.message));
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fields = Object.fromEntries(new FormData(e.currentTarget));
    if (
      (mode === "signup" || mode === "register") &&
      fields.password !== fields.confirmPassword
    ) {
      setError("Passwords must match.");
      setBusy(false);
      return;
    }
    try {
      const r = await request("/auth/" + mode, "POST", {
        ...fields,
        token: invite || reset || undefined,
      });
      if (r.user) {
        setCsrf(r.csrf);
        history.replaceState(null, "", location.pathname);
        onLogin(r.user);
      } else {
        setError(r.message);
        if (mode === "reset") setMode("login");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-brand">
        <Logo />
        <div>
          GOD <b>SUBCONSOLE</b>
          <small>YOUR WORLD. YOUR CONTROL.</small>
        </div>
      </div>
      <div className="auth-layout">
        <section className="auth-pitch">
          <div className="theme-edition">GOD SMP <span> / ELECTRIC BLUE</span></div>
          <div className="eyebrow">
            <span /> MINECRAFT SERVER CONTROL
          </div>
          <h1>
            A better place
            <br />
            to run <em>your world.</em>
          </h1>
          <p>
            One console. Every detail.
            <br />
            Built for the server you call home.
          </p>
          <div className="auth-grid-art" aria-hidden="true">
            <div />
            <div />
            <div />
            <div />
            <div />
            <div />
            <div />
          </div>
          <div className="lion-stage" aria-hidden="true">
            <div className="lion-orbit" />
            <img src="/god-smp.png" alt="" />
            <span className="lion-caption">YOUR KINGDOM. YOUR CONSOLE.</span>
          </div>
          <div className="auth-trust">
            <ShieldCheck size={18} /> Private sessions · Server-side credentials
          </div>
        </section>
        <section className="auth-card">
          {!invite && !reset && (
            <div className="auth-tabs" aria-label="Account options">
              <button
                type="button"
                className={mode === "login" ? "selected" : ""}
                aria-pressed={mode === "login"}
                onClick={() => {
                  setMode("login");
                  setError("");
                }}
              >
                Sign in
              </button>
              {status?.signupEnabled !== false && (
                <button
                  type="button"
                  className={mode === "signup" ? "selected" : ""}
                  aria-pressed={mode === "signup"}
                  onClick={() => {
                    setMode("signup");
                    setError("");
                  }}
                >
                  Sign up
                </button>
              )}
            </div>
          )}
          <div className="auth-lock">
            <LockKeyhole size={22} />
          </div>
          <h2>
            {mode === "register" || mode === "signup"
              ? ownerSetup && mode === "register"
                ? "Create owner account"
                : "Create your account"
              : mode === "forgot"
                ? "Recover your account"
                : mode === "reset"
                  ? "Choose a new password"
                  : "Welcome back"}
          </h2>
          <p>
            {mode === "register" || mode === "signup"
              ? invite
                ? ownerSetup
                  ? "Set up the first owner for this website. If you already signed up, enter that email and its current password."
                  : "Create your invited account to continue."
                : "Join GOD SUBCONSOLE. Server access requires owner approval."
              : "Your server is one sign-in away."}
          </p>
          {status?.setupRequired && mode === "login" && (
            <div className="notice">
              Owner setup is required. Run <code>npm run bootstrap</code> in the
              project folder, then open the one-time link printed in your
              terminal.
            </div>
          )}
          <form key={mode} onSubmit={submit}>
            {(mode === "register" || mode === "signup") && (
              <label>
                Display name
                <input
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={80}
                />
              </label>
            )}
            {mode !== "reset" && (
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="username"
                  required
                />
              </label>
            )}
            {mode !== "forgot" && (
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  minLength={mode === "login" ? 1 : 12}
                  maxLength={128}
                  placeholder={
                    mode === "login"
                      ? "Enter your password"
                      : "At least 12 characters"
                  }
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  required
                />
              </label>
            )}
            {(mode === "signup" || mode === "register") && (
              <label>
                Confirm password
                <input
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  placeholder="Re-enter your password"
                  required
                />
              </label>
            )}
            {(mode === "login" || (ownerSetup && mode === "register")) && (
              <label>
                Authenticator or recovery code{" "}
                <span className="muted">if enabled</span>
                <input
                  name="code"
                  autoComplete="one-time-code"
                  placeholder="6-digit code"
                />
              </label>
            )}
            {error && (
              <div className="notice" role="alert">
                {error}
              </div>
            )}
            <button className="primary auth-submit" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "login"
                  ? "Sign in to your console"
                  : mode === "register" || mode === "signup"
                    ? ownerSetup && mode === "register"
                      ? "Create owner account"
                      : "Create new account"
                    : mode === "forgot"
                      ? "Send recovery email"
                      : "Update password"}
              <ArrowRight size={17} />
            </button>
          </form>
          {mode === "login" ? (
            <>
              <button
                className="text-button"
                onClick={() => {
                  setMode("forgot");
                  setError("");
                }}
              >
                Forgot your password?
              </button>
              {status?.signupEnabled !== false && (
                <button
                  className="text-button signup-link"
                  onClick={() => {
                    setMode("signup");
                    setError("");
                  }}
                >
                  New here? Create an account <ArrowRight size={14} />
                </button>
              )}
            </>
          ) : (
            <button
              className="text-button"
              onClick={() => {
                setMode("login");
                setError("");
              }}
            >
              Back to sign in
            </button>
          )}
          <div className="auth-note">
            <ShieldCheck size={14} />
            {ownerSetup && mode === "register"
              ? "Owner setup grants management access to this website."
              : "New accounts require approval for server access."}
          </div>
        </section>
      </div>
      <footer className="auth-footer">
        GOD SUBCONSOLE <span>Crafted for control.</span>
      </footer>
    </div>
  );
}
