/*
 * Shared formatting and date utilities used across components.
 */

export function pad(n) {
  return String(n).padStart(2, "0");
}

export function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export function formatTotal(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

export function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function startOfWeek(d) {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

export function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function startOfYear(d) {
  return new Date(d.getFullYear(), 0, 1);
}

export function addDays(d, n) {
  return new Date(d.getTime() + n * 86400000);
}

export function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isToday(iso) {
  return isSameDay(new Date(iso), new Date());
}

export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/* ===== theme helpers ===== */

export function getThemePref() {
  if (typeof window === "undefined") return "dark";
  try {
    return localStorage.getItem("alltime.theme") || "system";
  } catch {
    return "system";
  }
}

export function resolveTheme(pref) {
  if (pref === "light" || pref === "dark") return pref;
  if (typeof window !== "undefined") {
    return window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }
  return "dark";
}

export function applyTheme(pref) {
  const resolved = resolveTheme(pref);
  document.documentElement.setAttribute("data-theme", resolved);
}

/* ===== haptic feedback with patterns ===== */

export const HAPTIC_PATTERNS = {
  short: [10],
  medium: [20],
  long: [40],
  double: [10, 50, 10],
  triple: [10, 50, 10, 50, 10],
  success: [10, 30, 10, 30, 10],
  error: [40, 50, 40],
  warning: [20, 30, 20, 30, 20],
};

export function haptic(pattern) {
  try {
    if (typeof navigator === "undefined") return;
    if (!navigator.vibrate) return;
    
    // Check if user prefers reduced motion
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    
    const pat = typeof pattern === "string" ? HAPTIC_PATTERNS[pattern] : pattern;
    if (pat) navigator.vibrate(pat);
  } catch {}
}

/* ===== iOS detection ===== */

export function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

export function isStandalone() {
  if (typeof navigator === "undefined") return false;
  return (
    window.navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

/* ===== CSV export ===== */

export function exportCSV(sessions, tasks) {
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

export function computeStreak(sessions) {
  if (!sessions.length) return 0;
  const daySet = new Set();
  sessions.forEach((s) => {
    if (s.ms > 60000) {
      daySet.add(startOfDay(new Date(s.endedAt)).toISOString());
    }
  });
  let streak = 0;
  let d = startOfDay(new Date());
  if (!daySet.has(d.toISOString())) {
    d = addDays(d, -1);
  }
  while (daySet.has(d.toISOString())) {
    streak++;
    d = addDays(d, -1);
  }
  return streak;
}
