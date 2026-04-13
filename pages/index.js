import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AuthScreen from "../components/AuthScreen";
import ErrorBoundary from "../components/ErrorBoundary";
import InsightsTab from "../components/InsightsTab";
import TaskEditor from "../components/TaskEditor";
import TasksTab from "../components/TasksTab";
import TimerTab from "../components/TimerTab";
import SettingsTab from "../components/SettingsTab";
import SyncStatusIndicator from "../components/SyncStatusIndicator";
import { useAuth } from "../lib/auth";
import { colorForUser } from "../lib/colors";
import { firebaseEnabled } from "../lib/firebase";
import {
  applyTheme,
  computeStreak,
  formatTotal,
  getThemePref,
  haptic,
  isIOS,
  isStandalone,
  isToday,
} from "../lib/formatters";
import {
  getPermissionState,
  notify,
  requestPermission,
} from "../lib/notifications";
import { addSession, subscribeSessions, removeSession, clearSessions } from "../lib/sessions";
import { addTask, subscribeTasks, deleteTask, updateTask } from "../lib/tasks";
import { useBrainDump } from "../lib/useBrainDump";
import { useIdleDetection } from "../lib/useIdleDetection";
import { useTimer } from "../lib/useTimer";
import { useToast } from "../lib/useToast";
import { useSyncStatus } from "../lib/useSyncStatus";
import { useOfflineQueue } from "../lib/useOfflineQueue";

/* ===== auth gate ===== */

export default function Home() {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="page center">
        <div className="loading" role="status" aria-live="polite">loading…</div>
      </div>
    );
  if (!user) return <AuthScreen />;
  return (
    <ErrorBoundary name="App">
      <AppShell user={user} />
    </ErrorBoundary>
  );
}

/* ===== JSON export/import ===== */

function exportJSON(tasks, sessions) {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    tasks: tasks.map((t) => ({ id: t.id, name: t.name, color: t.color, createdAt: t.createdAt })),
    sessions: sessions.map((s) => ({ id: s.id, task: s.task, taskId: s.taskId, ms: s.ms, endedAt: s.endedAt })),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `alltime-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importJSON(userId, file, showToast) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.version || !data.tasks || !data.sessions) {
      showToast("Invalid backup file");
      return;
    }
    let tasksAdded = 0;
    let sessionsAdded = 0;
    for (const t of data.tasks) {
      try {
        await addTask(userId, { name: t.name, color: t.color });
        tasksAdded++;
      } catch {}
    }
    for (const s of data.sessions) {
      try {
        await addSession(userId, {
          task: s.task,
          taskId: s.taskId || null,
          ms: s.ms,
          endedAt: s.endedAt,
        });
        sessionsAdded++;
      } catch {}
    }
    showToast(`Imported ${tasksAdded} tasks, ${sessionsAdded} sessions`);
  } catch {
    showToast("Failed to read backup file");
  }
}

/* ===== app shell ===== */

function AppShell({ user }) {
  const { logout } = useAuth();
  const NOTIFY_KEY = `alltime.notify.v1:${user.id}`;
  const fileInputRef = useRef(null);

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

  // --- sync status ---
  const syncStatus = useSyncStatus({ userId: user.id });

  // --- offline queue ---
  const offlineOps = useOfflineQueue({
    userId: user.id,
    operations: {
      addTask,
      updateTask,
      deleteTask,
      addSession,
      removeSession,
    },
  });

  // --- brain dump ---
  const brainDump = useBrainDump(user.id);

  // Subscribe to data
  useEffect(() => {
    const unsub1 = subscribeTasks(user.id, (t) => {
      setTasks(t);
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
    if (
      isIOS() &&
      !isStandalone() &&
      !localStorage.getItem("alltime.ios_banner_dismissed")
    ) {
      setShowIOSBanner(true);
    }
  }, [user.id]);

  // Keyboard detection
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    const threshold = 150;
    const fullH = vv.height;
    const onResize = () => {
      const open = fullH - vv.height > threshold;
      document.body.classList.toggle("keyboard-open", open);
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  // Save session callback
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

  const handleExportJSON = useCallback(() => {
    exportJSON(tasks, sessions);
    showToast("Backup exported");
  }, [tasks, sessions, showToast]);

  const handleImportJSON = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await importJSON(user.id, file, showToast);
      e.target.value = "";
    },
    [user.id, showToast]
  );

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
    if (timer.running) return;
    const titles = {
      timer: "AllTime",
      insights: "Insights — AllTime",
      tasks: "Tasks — AllTime",
      settings: "Settings — AllTime",
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
      {/* hidden file input for JSON import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={handleFileSelected}
        aria-hidden="true"
      />

      {/* header */}
      <header className="app-header">
        <div className="header-left">
          <div className="date-label">{dateStr.toUpperCase()}</div>
          <h1 className="logo">AllTime</h1>
        </div>
        <div className="header-right">
          {/* Sync Status Indicator */}
          <SyncStatusIndicator syncStatus={syncStatus.syncState} />
          
          <button
            className="icon-btn"
            onClick={() => {
              setEditingTask(null);
              setTaskEditorOpen(true);
            }}
            aria-label="Add task"
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
              aria-label="User menu"
              aria-expanded={menuOpen}
              aria-haspopup="true"
            >
              {(user.displayName || "U").slice(0, 1).toUpperCase()}
            </button>
            {menuOpen && (
              <div className="menu-pop" onClick={(e) => e.stopPropagation()} role="menu" aria-label="User menu">
                <div className="menu-email">{user.email}</div>

                {/* Theme */}
                <div className="menu-section">
                  <div className="menu-label" id="theme-label">theme</div>
                  <div className="seg" role="radiogroup" aria-labelledby="theme-label">
                    {[
                      { v: "system", l: "Auto" },
                      { v: "light", l: "Light" },
                      { v: "dark", l: "Dark" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        className={`seg-btn ${themePref === o.v ? "active" : ""}`}
                        onClick={() => setTheme(o.v)}
                        role="radio"
                        aria-checked={themePref === o.v}
                      >
                        {o.l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Notifications */}
                <div className="menu-section">
                  <div className="menu-label" id="notify-label">notify me every</div>
                  <div className="seg" role="radiogroup" aria-labelledby="notify-label">
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
                        role="radio"
                        aria-checked={notifyInterval === o.v}
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
                  <button className="menu-item" onClick={handleInstall} role="menuitem">
                    install app
                  </button>
                )}
                <button className="menu-item" onClick={handleLogout} role="menuitem">
                  log out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* iOS install banner */}
      {showIOSBanner && tab === "timer" && (
        <div className="ios-install-banner" role="banner">
          <span className="iib-icon" aria-hidden="true">📲</span>
          <div className="iib-text">
            <div className="iib-title">Add to Home Screen</div>
            <div className="iib-desc">
              Tap the share button{" "}
              <span style={{ fontSize: "1.1em" }} aria-hidden="true">⎙</span>{" "}
              then &quot;Add to Home Screen&quot; for the full app experience.
            </div>
          </div>
          <button
            className="iib-close"
            onClick={dismissIOSBanner}
            aria-label="Dismiss install banner"
          >
            ✕
          </button>
        </div>
      )}

      {/* onboarding */}
      {!onboarded && tab === "timer" && tasks.length === 0 && (
        <div className="onboarding" role="region" aria-label="Welcome">
          <div className="ob-icon" aria-hidden="true">⏱</div>
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
          <ErrorBoundary name="Timer">
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
          </ErrorBoundary>
        )}
        {tab === "insights" && (
          <ErrorBoundary name="Insights">
            <InsightsTab tasks={tasks} sessions={sessions} />
          </ErrorBoundary>
        )}
        {tab === "tasks" && (
          <ErrorBoundary name="Tasks">
            <TasksTab
              user={user}
              tasks={tasks}
              sessions={sessions}
              showToast={showToast}
              onNew={() => {
                setEditingTask(null);
                setTaskEditorOpen(true);
              }}
              onExportJSON={handleExportJSON}
              onImportJSON={handleImportJSON}
            />
          </ErrorBoundary>
        )}
        {tab === "settings" && (
          <ErrorBoundary name="Settings">
            <SettingsTab
              user={user}
              themePref={themePref}
              setTheme={setTheme}
              notifyInterval={notifyInterval}
              setNotifyInterval={handleNotifyChange}
              onLogout={handleLogout}
              onExportJSON={handleExportJSON}
              onImportJSON={handleImportJSON}
              showToast={showToast}
              syncStatus={syncStatus}
              offlineOps={offlineOps}
              tasks={tasks}
              sessions={sessions}
            />
          </ErrorBoundary>
        )}
      </main>

      {/* bottom nav */}
      <nav className="bottom-nav" aria-label="Main navigation">
        {[
          { id: "timer", icon: "⏱", label: "Timer" },
          { id: "insights", icon: "◧", label: "Insights" },
          { id: "tasks", icon: "⊞", label: "Tasks" },
          { id: "settings", icon: "⚙", label: "Settings" },
        ].map((t) => (
          <button
            key={t.id}
            className={`nav-btn ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
            aria-label={t.label}
            aria-current={tab === t.id ? "page" : undefined}
          >
            <span className="nav-icon" aria-hidden="true">{t.icon}</span>
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
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Welcome back">
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
        <div className="toast-container" role="status" aria-live="polite">
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
                aria-label="Dismiss notification"
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
