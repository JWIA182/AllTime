import { useCallback, useEffect, useRef, useState } from "react";

/*
 * useTimer — extracted timer logic from AppShell.
 *
 * Fixes:
 *  - No longer writes localStorage 60x/sec. Saves on state transitions
 *    (start/pause/stop/switch) and on beforeunload, NOT on every frame.
 *  - Screen Wake Lock keeps phone screen on while timer runs.
 *  - document.title updates with running timer for tab-switching awareness.
 *
 * Returns { state, actions } where state has elapsed/running/activeTaskId
 * and actions has start/pause/resume/stop/toggle.
 */

function formatTimeShort(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
  return `${m}:${pad(sec)}`;
}

export function useTimer({ userId, tasks, onSaveSession }) {
  const ACTIVE_KEY = `alltime.active.v1:${userId}`;

  const [activeTaskId, setActiveTaskId] = useState(null);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const startRef = useRef(null);
  const accumRef = useRef(0);
  const rafRef = useRef(null);
  const taskIdRef = useRef(null);
  const runningRef = useRef(false);
  const tasksRef = useRef(tasks);
  const onSaveRef = useRef(onSaveSession);

  // Keep refs in sync
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);
  useEffect(() => {
    onSaveRef.current = onSaveSession;
  }, [onSaveSession]);
  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  // --- persist helpers (NOT called on every frame) ---

  const persistActive = useCallback(() => {
    try {
      if (taskIdRef.current && (runningRef.current || accumRef.current > 0)) {
        localStorage.setItem(
          ACTIVE_KEY,
          JSON.stringify({
            taskId: taskIdRef.current,
            startedAt: runningRef.current ? startRef.current : null,
            accumulated: accumRef.current,
          })
        );
      } else {
        localStorage.removeItem(ACTIVE_KEY);
      }
    } catch {}
  }, [ACTIVE_KEY]);

  const clearActive = useCallback(() => {
    try {
      localStorage.removeItem(ACTIVE_KEY);
    } catch {}
  }, [ACTIVE_KEY]);

  // --- load active run on mount ---

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ACTIVE_KEY);
      if (raw) {
        const a = JSON.parse(raw);
        setActiveTaskId(a.taskId || null);
        taskIdRef.current = a.taskId || null;
        accumRef.current = a.accumulated || 0;
        if (a.startedAt) {
          startRef.current = a.startedAt;
          setRunning(true);
        } else {
          setElapsed(a.accumulated || 0);
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // --- tick loop (only updates React state, no localStorage) ---

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      setElapsed(accumRef.current + (Date.now() - startRef.current));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [running]);

  // --- tab title sync ---

  useEffect(() => {
    if (!running || !activeTaskId) {
      document.title = "all time — count up timer";
      return;
    }
    const interval = setInterval(() => {
      const cur = accumRef.current + (Date.now() - (startRef.current || Date.now()));
      const t = tasksRef.current.find((t) => t.id === taskIdRef.current);
      document.title = `(${formatTimeShort(cur)}) ${t?.name || "Timer"} — AllTime`;
    }, 1000);
    return () => {
      clearInterval(interval);
      document.title = "all time — count up timer";
    };
  }, [running, activeTaskId]);

  // --- screen wake lock ---

  useEffect(() => {
    if (!running) return;
    if (!("wakeLock" in navigator)) return;
    let lock = null;
    let released = false;
    navigator.wakeLock
      .request("screen")
      .then((l) => {
        if (released) {
          l.release();
        } else {
          lock = l;
        }
      })
      .catch(() => {});
    return () => {
      released = true;
      if (lock) lock.release().catch(() => {});
    };
  }, [running]);

  // --- save on tab close / navigate away ---

  useEffect(() => {
    const handler = () => persistActive();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [persistActive]);

  // --- get current elapsed (for saving) ---

  const getCurrentMs = useCallback(() => {
    if (runningRef.current && startRef.current) {
      return accumRef.current + (Date.now() - startRef.current);
    }
    return accumRef.current;
  }, []);

  // --- save the currently-running session ---

  const saveCurrentSession = useCallback(async () => {
    const total = getCurrentMs();
    if (total > 1000 && taskIdRef.current) {
      const t = tasksRef.current.find((t) => t.id === taskIdRef.current);
      try {
        await onSaveRef.current({
          taskId: taskIdRef.current,
          task: t?.name || "Untitled",
          ms: total,
          endedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error("[all time] save error:", err);
      }
    }
  }, [getCurrentMs]);

  // --- actions ---

  const startTask = useCallback(
    async (taskId) => {
      if (taskIdRef.current && (runningRef.current || accumRef.current > 0)) {
        await saveCurrentSession();
      }
      accumRef.current = 0;
      startRef.current = Date.now();
      setElapsed(0);
      setActiveTaskId(taskId);
      taskIdRef.current = taskId;
      setRunning(true);
      runningRef.current = true;
      // Persist on state transition
      setTimeout(() => {
        try {
          localStorage.setItem(
            ACTIVE_KEY,
            JSON.stringify({
              taskId,
              startedAt: Date.now(),
              accumulated: 0,
            })
          );
        } catch {}
      }, 0);
    },
    [saveCurrentSession, ACTIVE_KEY]
  );

  const pause = useCallback(() => {
    if (!runningRef.current) return;
    accumRef.current += Date.now() - startRef.current;
    setElapsed(accumRef.current);
    setRunning(false);
    runningRef.current = false;
    persistActive();
  }, [persistActive]);

  const resume = useCallback(() => {
    if (runningRef.current || !taskIdRef.current) return;
    startRef.current = Date.now();
    setRunning(true);
    runningRef.current = true;
    persistActive();
  }, [persistActive]);

  const stopAndSave = useCallback(async () => {
    await saveCurrentSession();
    accumRef.current = 0;
    startRef.current = null;
    setElapsed(0);
    setRunning(false);
    runningRef.current = false;
    setActiveTaskId(null);
    taskIdRef.current = null;
    clearActive();
  }, [saveCurrentSession, clearActive]);

  const toggle = useCallback(() => {
    if (runningRef.current) pause();
    else if (taskIdRef.current) resume();
  }, [pause, resume]);

  // --- idle auto-pause (called from useIdleDetection) ---

  const idlePause = useCallback(() => {
    if (!runningRef.current) return null;
    const pausedAt = Date.now();
    accumRef.current += pausedAt - startRef.current;
    setElapsed(accumRef.current);
    setRunning(false);
    runningRef.current = false;
    persistActive();
    return pausedAt;
  }, [persistActive]);

  const idleResume = useCallback(() => {
    if (runningRef.current || !taskIdRef.current) return;
    startRef.current = Date.now();
    setRunning(true);
    runningRef.current = true;
    persistActive();
  }, [persistActive]);

  const idleSubtract = useCallback(
    (ms) => {
      accumRef.current = Math.max(0, accumRef.current - ms);
      setElapsed(accumRef.current);
      persistActive();
    },
    [persistActive]
  );

  return {
    activeTaskId,
    running,
    elapsed,
    startTask,
    pause,
    resume,
    toggle,
    stopAndSave,
    idlePause,
    idleResume,
    idleSubtract,
    getCurrentMs,
  };
}
