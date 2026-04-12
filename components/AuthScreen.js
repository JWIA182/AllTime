import { useState } from "react";
import { useAuth } from "../lib/auth";
import { firebaseEnabled } from "../lib/firebase";

export default function AuthScreen() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await signup(email, password, displayName);
    } catch (err) {
      setError(err?.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page center">
      <main className="auth-wrap" role="main">
        <header className="auth-header">
          <h1 className="logo">AllTime</h1>
          <p className="sub">count up. no pressure. just see where it goes.</p>
        </header>
        <section className="auth-card" aria-label="Authentication">
          <div className="auth-tabs" role="tablist" aria-label="Login or sign up">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              className={`auth-tab ${mode === "login" ? "active" : ""}`}
              onClick={() => {
                setMode("login");
                setError("");
              }}
            >
              log in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signup"}
              className={`auth-tab ${mode === "signup" ? "active" : ""}`}
              onClick={() => {
                setMode("signup");
                setError("");
              }}
            >
              sign up
            </button>
          </div>
          <form className="auth-form" onSubmit={submit} aria-label={mode === "login" ? "Log in" : "Sign up"}>
            {mode === "signup" && (
              <input
                className="auth-input"
                type="text"
                placeholder="display name (optional)"
                aria-label="Display name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="nickname"
              />
            )}
            <input
              className="auth-input"
              type="email"
              placeholder="email"
              aria-label="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
            <input
              className="auth-input"
              type="password"
              placeholder="password"
              aria-label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              required
            />
            {error && (
              <div className="auth-error" role="alert">
                {error}
              </div>
            )}
            <button
              className="btn primary auth-submit"
              type="submit"
              disabled={busy}
            >
              {busy ? "…" : mode === "login" ? "log in" : "create account"}
            </button>
          </form>
          <p className="auth-note">
            {firebaseEnabled
              ? "sign up to sync your data across devices"
              : "local mode — data stays on this device"}
          </p>
        </section>
      </main>
    </div>
  );
}
