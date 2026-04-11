import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../lib/auth";
import { colorForTask, colorForUser } from "../lib/colors";
import {
  getPermissionState,
  notify,
  requestPermission,
} from "../lib/notifications";
import {
  addSession,
  clearSessions,
  removeSession as removeSessionRemote,
  subscribeSessions,
} from "../lib/sessions";

/* ---------- helpers ---------- */

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatTotal(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${totalSeconds}s`;
}

function isToday(iso) {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/* ---------- root: auth gate ---------- */

export default function Home() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="page center">
        <div className="loading">loading…</div>
      </div>
    );
  }
  if (!user) return <AuthScreen />;
  return <TimerApp user={user} />;
}

/* ---------- auth screen ---------- */

function AuthScreen() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState("login"); // "login" | "signup"
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

  const switchTo = (next) => {
    setMode(next);
    setError("");
  };

  return (
    <div className="page center">
      <main className="auth-wrap">
        <header className="head">
          <h1>all time</h1>
          <p className="sub">count up. no pressure. just see where it goes.</p>
        </header>

        <section className="auth-card">
          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab ${mode === "login" ? "active" : ""}`}
              onClick={() => switchTo("login")}
            >
              log in
            </button>
            <button
              type="button"
              className={`auth-tab ${mode === "signup" ? "active" : ""}`}
              onClick={() => switchTo("signup")}
            >
              sign up
            </button>
          </div>

          <form className="auth-form" onSubmit={submit}>
            {mode === "signup" && (
              <input
                className="auth-input"
                type="text"
                placeholder="display name (optional)"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="nickname"
              />
            )}
            <input
              className="auth-input"
              type="email"
              placeholder="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
            <input
              className="auth-input"
              type="password"
              placeholder="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
            />

            {error && <div className="auth-error">{error}</div>}

            <button
              className="btn primary auth-submit"
              type="submit"
              disabled={busy}
            >
              {busy ? "…" : mode === "login" ? "log in" : "create account"}
            </button>
          </form>

          <p className="auth-note">
            local accounts only — your data stays on this device until a real
            backend is wired up.
          </p>
        </section>
      </main>
    </div>
  );
}

/* ---------- timer app ---------- */

function TimerApp({ user }) {
  const { logout } = useAuth();

  // Active timer state stays in localStorage (per user) — too high-frequency
  // for Firestore. Completed sessions go through `lib/sessions.js`, which
  // routes to Firestore when configured and falls back to localStorage.
  const ACTIVE_KEY = `alltime.active.v1:${user.id}`;
  const NOTIFY_KEY = `alltime.notify.v1:${user.id}`;

  const [task, setTask] = useState("");
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0); // ms
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifyInterval, setNotifyInterval] = useState(0); // minutes; 0 = off
  const [notifyPerm, setNotifyPerm] = useState("default");
  const startRef = useRef(null);
  const accumRef = useRef(0);
  const rafRef = useRef(null);
  const taskRef = useRef("");
  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  // Subscribe to sessions for this user
  useEffect(() => {
    setSessionsLoading(true);
    const unsubscribe = subscribeSessions(user.id, (next) => {
      setSessions(next);
      setSessionsLoading(false);
    });
    return unsubscribe;
  }, [user.id]);

  // Load notification setting for this user + read current permission
  useEffect(() => {
    setNotifyPerm(getPermissionState());
    try {
      const raw = localStorage.getItem(NOTIFY_KEY);
      setNotifyInterval(raw ? Number(raw) || 0 : 0);
    } catch {
      setNotifyInterval(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  // Load active run for this user
  useEffect(() => {
    try {
      const active = localStorage.getItem(ACTIVE_KEY);
      if (active) {
        const { task: t, startedAt, accumulated } = JSON.parse(active);
        setTask(t || "");
        accumRef.current = accumulated || 0;
        if (startedAt) {
          startRef.current = startedAt;
          setRunning(true);
        } else {
          setElapsed(accumulated || 0);
        }
      } else {
        accumRef.current = 0;
        startRef.current = null;
        setElapsed(0);
        setTask("");
        setRunning(false);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  // Persist active run
  useEffect(() => {
    try {
      if (running || accumRef.current > 0) {
        localStorage.setItem(
          ACTIVE_KEY,
          JSON.stringify({
            task,
            startedAt: running ? startRef.current : null,
            accumulated: accumRef.current,
          })
        );
      } else {
        localStorage.removeItem(ACTIVE_KEY);
      }
    } catch {}
  }, [running, task, elapsed, ACTIVE_KEY]);

  // Ticking loop
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const now = Date.now();
      setElapsed(accumRef.current + (now - startRef.current));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [running]);

  const start = () => {
    if (running) return;
    startRef.current = Date.now();
    setRunning(true);
  };

  const pause = () => {
    if (!running) return;
    accumRef.current = accumRef.current + (Date.now() - startRef.current);
    setElapsed(accumRef.current);
    setRunning(false);
  };

  const toggle = () => (running ? pause() : start());

  // Schedule milestone notifications while running.
  // Fires at every multiple of `notifyInterval` minutes of elapsed time.
  useEffect(() => {
    if (!running || !notifyInterval) return;
    if (notifyPerm !== "granted") return;
    const intervalMs = notifyInterval * 60 * 1000;
    let timer;
    const schedule = () => {
      const currentMs =
        accumRef.current + (Date.now() - (startRef.current || Date.now()));
      const nextMilestone =
        Math.ceil((currentMs + 1) / intervalMs) * intervalMs;
      const delay = Math.max(250, nextMilestone - currentMs);
      timer = setTimeout(() => {
        const label = (taskRef.current || "your timer").trim() || "your timer";
        notify(
          "all time",
          `${formatTotal(nextMilestone)} on ${label}`,
          `alltime-${user.id}`
        );
        schedule();
      }, delay);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [running, notifyInterval, notifyPerm, user.id]);

  const handleNotifyChange = useCallback(
    async (minutes) => {
      if (minutes > 0) {
        const result = await requestPermission();
        setNotifyPerm(result);
        if (result !== "granted") {
          setNotifyInterval(0);
          try {
            localStorage.setItem(NOTIFY_KEY, "0");
          } catch {}
          return;
        }
      }
      setNotifyInterval(minutes);
      try {
        localStorage.setItem(NOTIFY_KEY, String(minutes));
      } catch {}
    },
    [NOTIFY_KEY]
  );

  // Space bar = start/pause (ignored when typing in an input)
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== "Space") return;
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const saveAndReset = async () => {
    const total = running
      ? accumRef.current + (Date.now() - startRef.current)
      : accumRef.current;
    // Reset UI immediately so the user gets feedback even if the network is slow.
    accumRef.current = 0;
    startRef.current = null;
    setElapsed(0);
    setRunning(false);
    setTask("");
    try {
      localStorage.removeItem(ACTIVE_KEY);
    } catch {}
    if (total > 0) {
      try {
        await addSession(user.id, {
          task: task.trim() || "Untitled",
          ms: total,
          endedAt: new Date().toISOString(),
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[all time] failed to save session:", err);
        alert("Couldn't save that session. Check your connection.");
      }
    }
  };

  const discard = () => {
    accumRef.current = 0;
    startRef.current = null;
    setElapsed(0);
    setRunning(false);
    try {
      localStorage.removeItem(ACTIVE_KEY);
    } catch {}
  };

  const handleRemove = async (id) => {
    try {
      await removeSessionRemote(user.id, id);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[all time] failed to remove session:", err);
    }
  };

  const clearAll = async () => {
    if (!confirm("Clear all logged sessions?")) return;
    try {
      await clearSessions(user.id);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[all time] failed to clear sessions:", err);
    }
  };

  const handleLogout = async () => {
    if (running || elapsed > 0) {
      if (!confirm("You have an unsaved timer. Log out anyway?")) return;
    }
    await logout();
  };

  // Today total (live — includes the currently-running timer)
  const todayTotal = useMemo(() => {
    const logged = sessions
      .filter((s) => isToday(s.endedAt))
      .reduce((a, s) => a + s.ms, 0);
    return logged + (elapsed || 0);
  }, [sessions, elapsed]);

  // Group totals by task name
  const totalsList = useMemo(() => {
    const totals = sessions.reduce((acc, s) => {
      acc[s.task] = (acc[s.task] || 0) + s.ms;
      return acc;
    }, {});
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [sessions]);

  return (
    <div className="page">
      <main className="wrap">
        <header className="app-header">
          <div className="brand">
            <h1>all time</h1>
            <p className="sub">hi {user.displayName}.</p>
          </div>
          <div className={`user-menu ${menuOpen ? "open" : ""}`}>
            <button
              className="avatar"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="account menu"
              style={{ background: colorForUser(user) }}
            >
              {user.displayName.slice(0, 1).toUpperCase()}
            </button>
            {menuOpen && (
              <div className="menu-pop">
                <div className="menu-email">{user.email}</div>

                <div className="menu-section">
                  <div className="menu-label">notify me every</div>
                  <div className="seg">
                    {[
                      { v: 0, l: "off" },
                      { v: 15, l: "15m" },
                      { v: 30, l: "30m" },
                      { v: 60, l: "1h" },
                    ].map((opt) => (
                      <button
                        key={opt.v}
                        className={`seg-btn ${notifyInterval === opt.v ? "active" : ""}`}
                        onClick={() => handleNotifyChange(opt.v)}
                      >
                        {opt.l}
                      </button>
                    ))}
                  </div>
                  {notifyPerm === "denied" && (
                    <div className="menu-hint">
                      notifications blocked in your browser settings
                    </div>
                  )}
                  {notifyPerm === "unsupported" && (
                    <div className="menu-hint">
                      install this site to your home screen to enable
                      notifications
                    </div>
                  )}
                </div>

                <button className="menu-item" onClick={handleLogout}>
                  log out
                </button>
              </div>
            )}
          </div>
        </header>

        <section className="timer-card">
          <div className="today-stat">
            today <strong>{formatTotal(todayTotal)}</strong>
          </div>

          <input
            className="task-input"
            type="text"
            placeholder="what are you working on?"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            spellCheck={false}
          />

          <div className={`timer ${running ? "is-running" : ""}`}>
            {formatTime(elapsed)}
          </div>

          <div className="controls">
            {!running ? (
              <button className="btn primary" onClick={start}>
                {elapsed > 0 ? "resume" : "start"}
              </button>
            ) : (
              <button className="btn primary" onClick={pause}>
                pause
              </button>
            )}
            <button
              className="btn"
              onClick={saveAndReset}
              disabled={elapsed === 0 && !running}
            >
              save
            </button>
            <button
              className="btn ghost"
              onClick={discard}
              disabled={elapsed === 0 && !running}
            >
              discard
            </button>
          </div>

          <div className="hint">space to start / pause</div>
        </section>

        {totalsList.length > 0 && (
          <section className="totals">
            <div className="section-head">
              <h2>totals</h2>
            </div>
            <ul className="total-list">
              {totalsList.map(([name, ms]) => (
                <li key={name}>
                  <span className="t-name">
                    <span
                      className="task-dot"
                      style={{ background: colorForTask(name) }}
                    />
                    {name}
                  </span>
                  <span className="t-time">{formatTotal(ms)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {sessions.length > 0 && (
          <section className="log">
            <div className="section-head">
              <h2>sessions</h2>
              <button className="linkish" onClick={clearAll}>
                clear all
              </button>
            </div>
            <ul className="log-list">
              {sessions.map((s) => (
                <li key={s.id}>
                  <div className="log-main">
                    <span className="log-task">
                      <span
                        className="task-dot"
                        style={{ background: colorForTask(s.task) }}
                      />
                      {s.task}
                    </span>
                    <span className="log-time">{formatTotal(s.ms)}</span>
                  </div>
                  <div className="log-sub">
                    <span>{new Date(s.endedAt).toLocaleString()}</span>
                    <button
                      className="linkish"
                      onClick={() => handleRemove(s.id)}
                    >
                      remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
