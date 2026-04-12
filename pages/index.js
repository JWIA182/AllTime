import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../lib/auth";
import { colorForTask, colorForUser, taskColorPalette } from "../lib/colors";
import { firebaseEnabled } from "../lib/firebase";
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
import { addTask, deleteTask, subscribeTasks, updateTask } from "../lib/tasks";
import { useBrainDump } from "../lib/useBrainDump";
import { useIdleDetection } from "../lib/useIdleDetection";
import { useTimer } from "../lib/useTimer";
import { useToast } from "../lib/useToast";

/* ===== helpers ===== */

function pad(n) {
  return String(n).padStart(2, "0");
}
function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
function formatTotal(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function startOfWeek(d) {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}
function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function startOfYear(d) {
  return new Date(d.getFullYear(), 0, 1);
}
function addDays(d, n) {
  return new Date(d.getTime() + n * 86400000);
}
function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function isToday(iso) {
  return isSameDay(new Date(iso), new Date());
}
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];

/* ===== theme helpers ===== */

function getThemePref() {
  if (typeof window === "undefined") return "dark";
  try {
    return localStorage.getItem("alltime.theme") || "system";
  } catch {
    return "system";
  }
}
function resolveTheme(pref) {
  if (pref === "light" || pref === "dark") return pref;
  if (typeof window !== "undefined") {
    return window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }
  return "dark";
}
function applyTheme(pref) {
  const resolved = resolveTheme(pref);
  document.documentElement.setAttribute("data-theme", resolved);
}

/* ===== haptic ===== */

function haptic(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern || [10]);
  } catch {}
}

/* ===== iOS detection ===== */

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}
function isStandalone() {
  if (typeof navigator === "undefined") return false;
  return (
    window.navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

/* ===== CSV export ===== */

function exportCSV(sessions, tasks) {
  const tasksMap = {};
  tasks.forEach((t) => (tasksMap[t.id] = t));
  const header = "Date,Task,Duration (min),Duration,Ended At\n";
  const rows = sessions
    .map((s) => {
      const name =
        s.taskId && tasksMap[s.taskId] ? tasksMap[s.taskId].name : s.task;
      const mins = (s.ms / 60000).toFixed(1);
      const ended = new Date(s.endedAt).toLocaleString();
      return `"${new Date(s.endedAt).toLocaleDateString()}","${name}",${mins},"${formatTotal(s.ms)}","${ended}"`;
    })
    .join("\n");
  const blob = new Blob([header + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `alltime-sessions-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ===== streak ===== */

function computeStreak(sessions) {
  if (!sessions.length) return 0;
  const daySet = new Set();
  sessions.forEach((s) => {
    if (s.ms > 60000) {
      daySet.add(startOfDay(new Date(s.endedAt)).toISOString());
    }
  });
  let streak = 0;
  let d = startOfDay(new Date());
  // Check today first — if no sessions today, start from yesterday
  if (!daySet.has(d.toISOString())) {
    d = addDays(d, -1);
  }
  while (daySet.has(d.toISOString())) {
    streak++;
    d = addDays(d, -1);
  }
  return streak;
}

/* ===== auth gate ===== */

export default function Home() {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="page center">
        <div className="loading">loading…</div>
      </div>
    );
  if (!user) return <AuthScreen />;
  return <AppShell user={user} />;
}

/* ===== auth screen ===== */

function AuthScreen() {
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
      <main className="auth-wrap">
        <header className="auth-header">
          <h1 className="logo">AllTime</h1>
          <p className="sub">count up. no pressure. just see where it goes.</p>
        </header>
        <section className="auth-card">
          <div className="auth-tabs">
            <button
              type="button"
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
              className={`auth-tab ${mode === "signup" ? "active" : ""}`}
              onClick={() => {
                setMode("signup");
                setError("");
              }}
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
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
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
            {firebaseEnabled
              ? "sign up to sync your data across devices"
              : "local mode — data stays on this device"}
          </p>
        </section>
      </main>
    </div>
  );
}

/* ===== app shell ===== */

function AppShell({ user }) {
  const { logout } = useAuth();
  const NOTIFY_KEY = `alltime.notify.v1:${user.id}`;

  // --- data ---
  const [tab, setTab] = useState("timer");
  const [tasks, setTasks] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [taskEditorOpen, setTaskEditorOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [showIOSBanner, setShowIOSBanner] = useState(false);
  const [onboarded, setOnboarded] = useState(true);

  // --- theme ---
  const [themePref, setThemePref] = useState("system");
  useEffect(() => {
    const pref = getThemePref();
    setThemePref(pref);
    applyTheme(pref);
    // Listen for system changes when pref is "system"
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      if (getThemePref() === "system") applyTheme("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setTheme = useCallback((pref) => {
    setThemePref(pref);
    try {
      localStorage.setItem("alltime.theme", pref);
    } catch {}
    applyTheme(pref);
  }, []);

  // --- notifications ---
  const [notifyInterval, setNotifyInterval] = useState(0);
  const [notifyPerm, setNotifyPerm] = useState("default");

  // --- PWA install ---
  const [installPrompt, setInstallPrompt] = useState(null);

  // --- toast ---
  const { toasts, showToast, dismissToast, handleUndo } = useToast();

  // --- brain dump ---
  const brainDump = useBrainDump(user.id);

  // Subscribe to data
  useEffect(() => {
    const unsub1 = subscribeTasks(user.id, (t) => {
      setTasks(t);
      // Check onboarding
      if (t.length > 0) {
        setOnboarded(true);
        try {
          localStorage.setItem(`alltime.onboarded.v1:${user.id}`, "1");
        } catch {}
      }
    });
    const unsub2 = subscribeSessions(user.id, setSessions);
    return () => {
      unsub1();
      unsub2();
    };
  }, [user.id]);

  // Check onboarding + iOS banner on mount
  useEffect(() => {
    try {
      setOnboarded(
        !!localStorage.getItem(`alltime.onboarded.v1:${user.id}`)
      );
    } catch {}
    // iOS install banner: show if iOS Safari + not yet installed + not dismissed
    if (
      isIOS() &&
      !isStandalone() &&
      !localStorage.getItem("alltime.ios_banner_dismissed")
    ) {
      setShowIOSBanner(true);
    }
  }, [user.id]);

  // Keyboard detection: hide bottom nav when virtual keyboard opens
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    const threshold = 150; // px reduction that suggests keyboard
    const fullH = vv.height;
    const onResize = () => {
      const open = fullH - vv.height > threshold;
      document.body.classList.toggle("keyboard-open", open);
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  // Save session callback (passed to useTimer)
  const saveSession = useCallback(
    async (session) => {
      await addSession(user.id, session);
    },
    [user.id]
  );

  // --- timer hook ---
  const timer = useTimer({
    userId: user.id,
    tasks,
    onSaveSession: saveSession,
  });

  // --- idle detection ---
  const onIdle = useCallback(() => {
    timer.idlePause();
  }, [timer]);

  const onIdleReturn = useCallback(
    (wasWorking, idleSince) => {
      if (wasWorking) {
        timer.idleResume();
      } else if (idleSince) {
        const idleMs = Date.now() - idleSince;
        timer.idleSubtract(idleMs);
        timer.idleResume();
      }
    },
    [timer]
  );

  const idle = useIdleDetection({
    running: timer.running,
    onIdle,
  });

  // Notification settings
  useEffect(() => {
    setNotifyPerm(getPermissionState());
    try {
      setNotifyInterval(Number(localStorage.getItem(NOTIFY_KEY)) || 0);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  // Milestone notifications
  useEffect(() => {
    if (!timer.running || !notifyInterval || notifyPerm !== "granted") return;
    const intervalMs = notifyInterval * 60 * 1000;
    let t;
    const schedule = () => {
      const cur = timer.getCurrentMs();
      const next = Math.ceil((cur + 1) / intervalMs) * intervalMs;
      t = setTimeout(() => {
        const task = tasks.find((tk) => tk.id === timer.activeTaskId);
        notify(
          "all time",
          `${formatTotal(next)} on ${task?.name || "your task"}`,
          `at-${user.id}`
        );
        schedule();
      }, Math.max(250, next - cur));
    };
    schedule();
    return () => clearTimeout(t);
  }, [timer.running, notifyInterval, notifyPerm, user.id, tasks, timer]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      // Escape always works: close modals/menus
      if (e.code === "Escape") {
        if (taskEditorOpen) {
          setTaskEditorOpen(false);
          return;
        }
        if (menuOpen) {
          setMenuOpen(false);
          return;
        }
        return;
      }

      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;

      if (e.code === "Space") {
        e.preventDefault();
        haptic();
        timer.toggle();
      } else if (e.code === "KeyS" && timer.activeTaskId) {
        e.preventDefault();
        haptic([10, 30, 10]);
        timer.stopAndSave();
      } else if (e.code === "KeyN" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setEditingTask(null);
        setTaskEditorOpen(true);
      } else if (
        e.code.startsWith("Digit") &&
        !e.ctrlKey &&
        !e.metaKey &&
        tab === "timer"
      ) {
        const idx = parseInt(e.code.replace("Digit", ""), 10) - 1;
        if (idx >= 0 && idx < tasks.length) {
          e.preventDefault();
          haptic();
          timer.startTask(tasks[idx].id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [timer, tasks, tab, taskEditorOpen, menuOpen]);

  // PWA install prompt
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    setTimeout(() => document.addEventListener("click", close), 0);
    return () => document.removeEventListener("click", close);
  }, [menuOpen]);

  const handleNotifyChange = useCallback(
    async (mins) => {
      if (mins > 0) {
        const result = await requestPermission();
        setNotifyPerm(result);
        if (result !== "granted") {
          setNotifyInterval(0);
          localStorage.setItem(NOTIFY_KEY, "0");
          return;
        }
      }
      setNotifyInterval(mins);
      localStorage.setItem(NOTIFY_KEY, String(mins));
    },
    [NOTIFY_KEY]
  );

  const handleInstall = useCallback(async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }, [installPrompt]);

  const handleLogout = useCallback(async () => {
    if (timer.running || timer.elapsed > 0) {
      showToast("Save your timer before logging out");
      return;
    }
    await logout();
  }, [timer, logout, showToast]);

  // Active task
  const activeTask = tasks.find((t) => t.id === timer.activeTaskId) || null;

  // Today total
  const todayTotal = useMemo(() => {
    const logged = sessions
      .filter((s) => isToday(s.endedAt))
      .reduce((a, s) => a + s.ms, 0);
    return logged + (timer.activeTaskId ? timer.elapsed : 0);
  }, [sessions, timer.elapsed, timer.activeTaskId]);

  // Per-task today totals
  const taskTodayMs = useMemo(() => {
    const map = {};
    sessions
      .filter((s) => isToday(s.endedAt))
      .forEach((s) => {
        const key = s.taskId || s.task;
        map[key] = (map[key] || 0) + s.ms;
      });
    return map;
  }, [sessions]);

  // Streak
  const streak = useMemo(() => computeStreak(sessions), [sessions]);

  // Tab title when timer is not running
  useEffect(() => {
    if (timer.running) return; // useTimer handles title while running
    const titles = {
      timer: "AllTime",
      insights: "Insights — AllTime",
      tasks: "Tasks — AllTime",
    };
    document.title = titles[tab] || "AllTime";
  }, [tab, timer.running]);

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const dismissIOSBanner = () => {
    setShowIOSBanner(false);
    try {
      localStorage.setItem("alltime.ios_banner_dismissed", "1");
    } catch {}
  };

  return (
    <div className={`app tab-${tab}`}>
      {/* header */}
      <header className="app-header">
        <div className="header-left">
          <div className="date-label">{dateStr.toUpperCase()}</div>
          <h1 className="logo">AllTime</h1>
        </div>
        <div className="header-right">
          <button
            className="icon-btn"
            onClick={() => {
              setEditingTask(null);
              setTaskEditorOpen(true);
            }}
            aria-label="add task"
          >
            +
          </button>
          <div className="user-menu">
            <button
              className="avatar"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              style={{ background: colorForUser(user) }}
            >
              {(user.displayName || "U").slice(0, 1).toUpperCase()}
            </button>
            {menuOpen && (
              <div className="menu-pop" onClick={(e) => e.stopPropagation()}>
                <div className="menu-email">{user.email}</div>

                {/* Theme */}
                <div className="menu-section">
                  <div className="menu-label">theme</div>
                  <div className="seg">
                    {[
                      { v: "system", l: "Auto" },
                      { v: "light", l: "Light" },
                      { v: "dark", l: "Dark" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        className={`seg-btn ${themePref === o.v ? "active" : ""}`}
                        onClick={() => setTheme(o.v)}
                      >
                        {o.l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Notifications */}
                <div className="menu-section">
                  <div className="menu-label">notify me every</div>
                  <div className="seg">
                    {[
                      { v: 0, l: "off" },
                      { v: 15, l: "15m" },
                      { v: 30, l: "30m" },
                      { v: 60, l: "1h" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        className={`seg-btn ${notifyInterval === o.v ? "active" : ""}`}
                        onClick={() => handleNotifyChange(o.v)}
                      >
                        {o.l}
                      </button>
                    ))}
                  </div>
                  {notifyPerm === "denied" && (
                    <div className="menu-hint">blocked in browser settings</div>
                  )}
                  {notifyPerm === "unsupported" && (
                    <div className="menu-hint">
                      install to home screen for notifications
                    </div>
                  )}
                </div>

                {/* Shortcuts */}
                <div className="shortcuts-list">
                  <h4>Shortcuts</h4>
                  <div className="sc-row">
                    <span>pause / resume</span>
                    <span className="sc-key">space</span>
                  </div>
                  <div className="sc-row">
                    <span>stop & save</span>
                    <span className="sc-key">S</span>
                  </div>
                  <div className="sc-row">
                    <span>start task 1–9</span>
                    <span className="sc-key">1-9</span>
                  </div>
                  <div className="sc-row">
                    <span>new task</span>
                    <span className="sc-key">N</span>
                  </div>
                  <div className="sc-row">
                    <span>close modal</span>
                    <span className="sc-key">Esc</span>
                  </div>
                </div>

                {installPrompt && (
                  <button className="menu-item" onClick={handleInstall}>
                    install app
                  </button>
                )}
                <button className="menu-item" onClick={handleLogout}>
                  log out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* iOS install banner */}
      {showIOSBanner && tab === "timer" && (
        <div className="ios-install-banner">
          <span className="iib-icon">📲</span>
          <div className="iib-text">
            <div className="iib-title">Add to Home Screen</div>
            <div className="iib-desc">
              Tap the share button{" "}
              <span style={{ fontSize: "1.1em" }}>⎙</span>{" "}
              then &quot;Add to Home Screen&quot; for the full app experience.
            </div>
          </div>
          <button
            className="iib-close"
            onClick={dismissIOSBanner}
            aria-label="dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* onboarding */}
      {!onboarded && tab === "timer" && tasks.length === 0 && (
        <div className="onboarding">
          <div className="ob-icon">⏱</div>
          <h3>Welcome to AllTime</h3>
          <p>
            Track how long you spend — not how little time is left.
            Create your first task to get started.
          </p>
          <button
            className="btn primary"
            onClick={() => {
              setEditingTask(null);
              setTaskEditorOpen(true);
            }}
          >
            + create a task
          </button>
        </div>
      )}

      {/* tab content */}
      <main className="tab-content">
        {tab === "timer" && (
          <TimerTab
            user={user}
            tasks={tasks}
            sessions={sessions}
            activeTask={activeTask}
            timer={timer}
            todayTotal={todayTotal}
            taskTodayMs={taskTodayMs}
            streak={streak}
            brainDump={brainDump}
            showToast={showToast}
            onEditTask={(t) => {
              setEditingTask(t);
              setTaskEditorOpen(true);
            }}
            onNewTask={() => {
              setEditingTask(null);
              setTaskEditorOpen(true);
            }}
          />
        )}
        {tab === "insights" && (
          <InsightsTab tasks={tasks} sessions={sessions} />
        )}
        {tab === "tasks" && (
          <TasksTab
            user={user}
            tasks={tasks}
            sessions={sessions}
            showToast={showToast}
            onNew={() => {
              setEditingTask(null);
              setTaskEditorOpen(true);
            }}
          />
        )}
      </main>

      {/* bottom nav */}
      <nav className="bottom-nav">
        {[
          { id: "timer", icon: "⏱", label: "Timer" },
          { id: "insights", icon: "◧", label: "Insights" },
          { id: "tasks", icon: "⊞", label: "Tasks" },
        ].map((t) => (
          <button
            key={t.id}
            className={`nav-btn ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            <span className="nav-icon">{t.icon}</span>
            <span className="nav-label">{t.label}</span>
          </button>
        ))}
      </nav>

      {/* task editor modal */}
      {taskEditorOpen && (
        <TaskEditor
          user={user}
          task={editingTask}
          onClose={() => setTaskEditorOpen(false)}
        />
      )}

      {/* idle return dialog */}
      {idle.idleState === "returned" && (
        <div className="modal-overlay">
          <div className="modal-card idle-card">
            <h3>Welcome back</h3>
            <p className="idle-msg">
              You were away for{" "}
              <strong>
                {formatTotal(Date.now() - (idle.idleSince || Date.now()))}
              </strong>
              . Were you still working?
            </p>
            <div className="modal-actions">
              <button
                className="btn ghost"
                onClick={() => idle.dismissIdle(false)}
              >
                no, subtract idle time
              </button>
              <button
                className="btn primary"
                onClick={() => idle.dismissIdle(true)}
              >
                yes, keep it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* toast container */}
      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map((t) => (
            <div key={t.id} className="toast">
              <span>{t.message}</span>
              {t.onUndo && (
                <button
                  className="toast-undo"
                  onClick={() => handleUndo(t.id)}
                >
                  Undo
                </button>
              )}
              <button
                className="toast-close"
                onClick={() => dismissToast(t.id)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ===== timer tab ===== */

function TimerTab({
  tasks,
  activeTask,
  timer,
  todayTotal,
  taskTodayMs,
  streak,
  brainDump,
  showToast,
  onEditTask,
  onNewTask,
}) {
  const [dumpInput, setDumpInput] = useState("");

  const handleDumpSubmit = (e) => {
    e.preventDefault();
    if (!dumpInput.trim()) return;
    brainDump.add(dumpInput);
    setDumpInput("");
  };

  const handleDumpRemove = (id) => {
    const removed = brainDump.remove(id);
    showToast("Thought dismissed", () => brainDump.restore(removed));
  };

  return (
    <div className="timer-tab">
      {/* now tracking banner */}
      {activeTask && (
        <div
          className="now-tracking"
          style={{ borderLeftColor: activeTask.color }}
        >
          <div className="nt-left">
            <div className="nt-label">NOW TRACKING</div>
            <div className="nt-task">
              <span
                className="dot"
                style={{ background: activeTask.color }}
              />
              {activeTask.name}
            </div>
          </div>
          <div className="nt-right">
            <div className="nt-timer">{formatTime(timer.elapsed)}</div>
            <div className="nt-controls">
              {timer.running ? (
                <button className="ctrl-btn" onClick={() => { haptic(); timer.pause(); }}>
                  ❚❚
                </button>
              ) : (
                <button className="ctrl-btn" onClick={() => { haptic(); timer.resume(); }}>
                  ▶
                </button>
              )}
              <button className="ctrl-btn stop" onClick={() => { haptic([10, 30, 10]); timer.stopAndSave(); }}>
                ■
              </button>
            </div>
          </div>
        </div>
      )}

      {/* brain dump input */}
      {timer.activeTaskId && (
        <form className="brain-dump-input" onSubmit={handleDumpSubmit}>
          <input
            type="text"
            placeholder="park a thought… (press enter)"
            value={dumpInput}
            onChange={(e) => setDumpInput(e.target.value)}
            className="auth-input bd-input"
          />
        </form>
      )}

      {/* today stat + streak */}
      <div className="today-row">
        <div className="today-stat">
          today <strong>{formatTotal(todayTotal)}</strong>
        </div>
        {streak > 0 && (
          <div className="streak">
            <span className="streak-icon">🔥</span>
            {streak}-day streak
          </div>
        )}
      </div>

      {/* task list */}
      <div className="section-head">
        <h2>YOUR TASKS</h2>
      </div>

      {tasks.length === 0 ? (
        <div className="empty">
          <p>no tasks yet</p>
          <button className="btn primary" onClick={onNewTask}>
            create your first task
          </button>
        </div>
      ) : (
        <ul className="task-list">
          {tasks.map((task, i) => {
            const isActive = task.id === timer.activeTaskId;
            const todayMs =
              (taskTodayMs[task.id] || 0) + (isActive ? timer.elapsed : 0);
            return (
              <li
                key={task.id}
                className={`task-card ${isActive ? "active" : ""}`}
              >
                <div className="tc-left" onClick={() => onEditTask(task)}>
                  <span className="dot" style={{ background: task.color }} />
                  <div className="tc-info">
                    <div className="tc-name">{task.name}</div>
                    <div className="tc-sub">
                      {isActive && timer.running ? (
                        <span className="running-badge">Running</span>
                      ) : todayMs > 0 ? (
                        `Today · ${formatTotal(todayMs)}`
                      ) : (
                        "No time today"
                      )}
                    </div>
                  </div>
                </div>
                <div className="tc-right">
                  <span className="tc-num">{i + 1}</span>
                  <span className="tc-time">
                    {isActive ? formatTime(timer.elapsed) : formatTotal(todayMs)}
                  </span>
                  {isActive && timer.running ? (
                    <button
                      className="play-btn"
                      onClick={() => { haptic(); timer.pause(); }}
                      aria-label="pause"
                    >
                      ❚❚
                    </button>
                  ) : (
                    <button
                      className="play-btn"
                      onClick={() => {
                        haptic();
                        isActive && !timer.running
                          ? timer.resume()
                          : timer.startTask(task.id);
                      }}
                      aria-label="play"
                    >
                      ▶
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* brain dump list */}
      {brainDump.items.length > 0 && (
        <div className="brain-dump-section">
          <div className="section-head">
            <h2>PARKED THOUGHTS</h2>
            <button
              className="linkish"
              onClick={() => {
                brainDump.clear();
                showToast("All thoughts cleared");
              }}
            >
              clear all
            </button>
          </div>
          <ul className="brain-dump-list">
            {brainDump.items.map((item) => (
              <li key={item.id} className="bd-item">
                <span className="bd-text">{item.text}</span>
                <button
                  className="bd-dismiss"
                  onClick={() => handleDumpRemove(item.id)}
                  aria-label="dismiss"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ===== insights tab ===== */

function InsightsTab({ tasks, sessions }) {
  const [period, setPeriod] = useState("week");

  const tasksMap = useMemo(() => {
    const m = {};
    tasks.forEach((t) => (m[t.id] = t));
    return m;
  }, [tasks]);

  function getTaskColor(s) {
    if (s.taskId && tasksMap[s.taskId]) return tasksMap[s.taskId].color;
    return colorForTask(s.task);
  }
  function getTaskName(s) {
    if (s.taskId && tasksMap[s.taskId]) return tasksMap[s.taskId].name;
    return s.task;
  }

  const now = new Date();
  const periodStart = useMemo(() => {
    if (period === "day") return startOfDay(now);
    if (period === "week") return startOfWeek(now);
    if (period === "month") return startOfMonth(now);
    return startOfYear(now);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const filtered = useMemo(
    () => sessions.filter((s) => new Date(s.endedAt) >= periodStart),
    [sessions, periodStart]
  );

  const totalMs = useMemo(
    () => filtered.reduce((a, s) => a + s.ms, 0),
    [filtered]
  );
  const sessionCount = filtered.length;

  const bestDay = useMemo(() => {
    const days = {};
    filtered.forEach((s) => {
      const key = startOfDay(new Date(s.endedAt)).toISOString();
      days[key] = (days[key] || 0) + s.ms;
    });
    let best = null;
    let bestMs = 0;
    Object.entries(days).forEach(([key, ms]) => {
      if (ms > bestMs) {
        bestMs = ms;
        best = new Date(key);
      }
    });
    return best
      ? {
          label: best.toLocaleDateString("en-US", { weekday: "long" }),
          ms: bestMs,
        }
      : null;
  }, [filtered]);

  const barData = useMemo(() => {
    if (period === "day") return [];
    const buckets = [];
    if (period === "week") {
      const ws = startOfWeek(now);
      for (let i = 0; i < 7; i++) {
        buckets.push({ start: addDays(ws, i), label: DAY_NAMES[i] });
      }
    } else if (period === "month") {
      const ms = startOfMonth(now);
      for (let w = 0; w < 5; w++) {
        const s = addDays(ms, w * 7);
        if (s.getMonth() !== now.getMonth() && w > 0) break;
        buckets.push({ start: s, label: `W${w + 1}` });
      }
    } else {
      for (let m = 0; m < 12; m++) {
        buckets.push({
          start: new Date(now.getFullYear(), m, 1),
          label: MONTH_NAMES[m],
        });
      }
    }

    return buckets.map((b, i) => {
      const end = buckets[i + 1]?.start || new Date(9999, 0);
      const inBucket = filtered.filter((s) => {
        const d = new Date(s.endedAt);
        return d >= b.start && d < end;
      });
      const byTask = {};
      inBucket.forEach((s) => {
        const name = getTaskName(s);
        if (!byTask[name]) byTask[name] = { hours: 0, color: getTaskColor(s) };
        byTask[name].hours += s.ms / 3600000;
      });
      return { label: b.label, segments: Object.values(byTask) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, period, tasks]);

  const maxBarHours = useMemo(
    () =>
      Math.max(
        1,
        ...barData.map((d) => d.segments.reduce((a, s) => a + s.hours, 0))
      ),
    [barData]
  );

  const donutData = useMemo(() => {
    const byTask = {};
    filtered.forEach((s) => {
      const name = getTaskName(s);
      if (!byTask[name])
        byTask[name] = { ms: 0, color: getTaskColor(s), name };
      byTask[name].ms += s.ms;
    });
    const sorted = Object.values(byTask).sort((a, b) => b.ms - a.ms);
    const total = sorted.reduce((a, s) => a + s.ms, 0) || 1;
    return sorted.map((s) => ({ ...s, pct: (s.ms / total) * 100 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, tasks]);

  return (
    <div className="insights-tab">
      <h2 className="tab-title">Insights</h2>

      <div className="period-tabs">
        {["day", "week", "month", "year"].map((p) => (
          <button
            key={p}
            className={`period-btn ${period === p ? "active" : ""}`}
            onClick={() => setPeriod(p)}
          >
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">{formatTotal(totalMs)}</div>
          <div className="stat-label">
            Total {period === "day" ? "today" : `this ${period}`}
          </div>
        </div>
        {bestDay && (
          <div className="stat-card">
            <div className="stat-value">{formatTotal(bestDay.ms)}</div>
            <div className="stat-label">Best Day</div>
            <div className="stat-sub">{bestDay.label}</div>
          </div>
        )}
        <div className="stat-card">
          <div className="stat-value">{sessionCount}</div>
          <div className="stat-label">Sessions</div>
        </div>
      </div>

      {barData.length > 0 && (
        <div className="chart-section">
          <h3 className="chart-title">
            {period === "year" ? "Hours per month" : "Hours per day"}
          </h3>
          <div className="chart-responsive">
            <BarChart data={barData} maxHours={maxBarHours} />
          </div>
        </div>
      )}

      {donutData.length > 0 && (
        <div className="chart-section donut-section">
          <div className="donut-wrap">
            <DonutChart segments={donutData} />
          </div>
          <ul className="donut-legend">
            {donutData.map((d) => (
              <li key={d.name}>
                <span className="dot" style={{ background: d.color }} />
                <span className="dl-name">{d.name}</span>
                <span className="dl-pct">{Math.round(d.pct)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="empty">
          <p>
            no sessions logged{" "}
            {period === "day" ? "today" : `this ${period}`}
          </p>
        </div>
      )}
    </div>
  );
}

/* ===== SVG charts ===== */

function BarChart({ data, maxHours }) {
  const W = 400;
  const H = 180;
  const PAD_T = 10;
  const PAD_B = 24;
  const PAD_X = 4;
  const chartH = H - PAD_T - PAD_B;
  const colW = (W - PAD_X * 2) / data.length;
  const barW = colW * 0.55;
  const scale = chartH / (maxHours || 1);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      className="chart-bar"
    >
      {data.map((day, i) => {
        const x = PAD_X + i * colW + (colW - barW) / 2;
        let y = H - PAD_B;
        return (
          <g key={i}>
            {day.segments.map((seg, j) => {
              const h = Math.max(0, seg.hours * scale);
              y -= h;
              return (
                <rect
                  key={j}
                  x={x}
                  y={y}
                  width={barW}
                  height={h}
                  fill={seg.color}
                  rx={3}
                />
              );
            })}
            <text
              x={PAD_X + i * colW + colW / 2}
              y={H - 4}
              textAnchor="middle"
              className="chart-label"
            >
              {day.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function DonutChart({ segments }) {
  const R = 70;
  const CX = 100;
  const CY = 100;
  const SW = 26;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <svg
      viewBox="0 0 200 200"
      preserveAspectRatio="xMidYMid meet"
      className="chart-donut"
    >
      <g transform={`rotate(-90 ${CX} ${CY})`}>
        {segments.map((seg, i) => {
          const dash = (seg.pct / 100) * C;
          const gap = segments.length > 1 ? 3 : 0;
          const el = (
            <circle
              key={i}
              cx={CX}
              cy={CY}
              r={R}
              fill="none"
              stroke={seg.color}
              strokeWidth={SW}
              strokeDasharray={`${Math.max(0, dash - gap)} ${C - dash + gap}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
            />
          );
          offset += dash;
          return el;
        })}
      </g>
    </svg>
  );
}

/* ===== tasks tab ===== */

function TasksTab({ user, tasks, sessions, showToast, onNew }) {
  const handleDelete = async (task) => {
    try {
      await deleteTask(user.id, task.id);
      showToast(`"${task.name}" deleted`, async () => {
        try {
          await addTask(user.id, { name: task.name, color: task.color });
        } catch {}
      });
    } catch (err) {
      console.error("[tasks] delete error:", err);
    }
  };

  const handleRemoveSession = async (s) => {
    try {
      await removeSessionRemote(user.id, s.id);
      showToast("Session removed", async () => {
        try {
          await addSession(user.id, {
            taskId: s.taskId,
            task: s.task,
            ms: s.ms,
            endedAt: s.endedAt,
          });
        } catch {}
      });
    } catch (err) {
      console.error("[sessions] remove error:", err);
    }
  };

  const handleClearAll = async () => {
    try {
      await clearSessions(user.id);
      showToast("All sessions cleared");
    } catch (err) {
      console.error("[sessions] clear error:", err);
    }
  };

  const totals = useMemo(() => {
    const m = {};
    sessions.forEach((s) => {
      const key = s.taskId || s.task;
      m[key] = (m[key] || 0) + s.ms;
    });
    return m;
  }, [sessions]);

  return (
    <div className="tasks-tab">
      <div className="tasks-header">
        <h2 className="tab-title">Tasks</h2>
        <div className="tasks-header-actions">
          {sessions.length > 0 && (
            <button
              className="btn small"
              onClick={() => exportCSV(sessions, tasks)}
            >
              Export CSV
            </button>
          )}
          <button className="btn primary small" onClick={onNew}>
            + New Task
          </button>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="empty">
          <p>no tasks yet — create one to get started</p>
        </div>
      ) : (
        <ul className="task-manage-list">
          {tasks.map((task) => (
            <li key={task.id} className="tm-card">
              <div className="tm-left">
                <span className="dot lg" style={{ background: task.color }} />
                <div className="tm-info">
                  <div className="tm-name">{task.name}</div>
                  <div className="tm-total">
                    {totals[task.id]
                      ? `Total: ${formatTotal(totals[task.id])}`
                      : "No sessions yet"}
                  </div>
                </div>
              </div>
              <div className="tm-actions">
                <button
                  className="icon-btn small danger"
                  onClick={() => handleDelete(task)}
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {sessions.length > 0 && (
        <div className="session-history">
          <div className="section-head">
            <h3>Recent Sessions</h3>
            <button className="linkish" onClick={handleClearAll}>
              clear all
            </button>
          </div>
          <ul className="session-list">
            {sessions.slice(0, 50).map((s) => (
              <li key={s.id} className="session-item">
                <div className="si-main">
                  <span
                    className="dot"
                    style={{
                      background:
                        s.taskId && tasks.find((t) => t.id === s.taskId)
                          ? tasks.find((t) => t.id === s.taskId).color
                          : colorForTask(s.task),
                    }}
                  />
                  <span className="si-task">{s.task}</span>
                  <span className="si-time">{formatTotal(s.ms)}</span>
                </div>
                <div className="si-sub">
                  {new Date(s.endedAt).toLocaleString()}
                  <button
                    className="linkish"
                    onClick={() => handleRemoveSession(s)}
                  >
                    remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ===== task editor modal ===== */

function TaskEditor({ user, task, onClose }) {
  const [name, setName] = useState(task?.name || "");
  const [color, setColor] = useState(task?.color || taskColorPalette[0]);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      if (task) {
        await updateTask(user.id, task.id, { name: trimmed, color });
      } else {
        await addTask(user.id, { name: trimmed, color });
      }
      onClose();
    } catch (err) {
      console.error("[task editor] error:", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3>{task ? "Edit Task" : "New Task"}</h3>
        <input
          className="auth-input"
          type="text"
          placeholder="Task name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        <div className="color-picker">
          {taskColorPalette.map((c) => (
            <button
              key={c}
              className={`color-swatch ${color === c ? "active" : ""}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={c}
            />
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>
            cancel
          </button>
          <button
            className="btn primary"
            onClick={save}
            disabled={!name.trim() || busy}
          >
            {busy ? "…" : task ? "save" : "create"}
          </button>
        </div>
      </div>
    </div>
  );
}
