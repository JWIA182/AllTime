import { useCallback, useEffect, useRef, useState } from "react";
import { doc, setDoc, onSnapshot, deleteDoc } from "firebase/firestore";
import { firebaseEnabled, getFirebase } from "./firebase";
import { getDeviceId } from "./useSyncStatus";

/*
 * useTimer — extracted timer logic from AppShell.
 * Now includes real-time syncing across devices via Firestore.
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

  // --- persist helpers (Syncs to both LocalStorage and Firestore) ---

  const persistActive = useCallback(async () => {
    if (!userId) return;

    const isActive = taskIdRef.current && (runningRef.current || accumRef.current > 0);
    const deviceId = getDeviceId();

    if (isActive) {
      const data = {
        taskId: taskIdRef.current,
        startedAt: runningRef.current ? startRef.current : null,
        accumulated: accumRef.current,
        updatedAt: Date.now(), // Helps prevent infinite sync loops
        deviceId, // Track which device started/updated the timer
        deviceTimestamp: Date.now(),
      };

      // 1. Save to local storage
      try {
        localStorage.setItem(ACTIVE_KEY, JSON.stringify(data));
      } catch {}

      // 2. Sync to Firebase
      if (firebaseEnabled) {
        try {
          const { db } = getFirebase();
          const docRef = doc(db, "users", userId, "state", "activeTimer");
          await setDoc(docRef, data);
        } catch (err) {
          console.error("[useTimer] Error syncing to Firestore:", err);
        }
      }
    } else {
      try {
        localStorage.removeItem(ACTIVE_KEY);
        if (firebaseEnabled) {
          const { db } = getFirebase();
          await deleteDoc(doc(db, "users", userId, "state", "activeTimer"));
        }
      } catch {}
    }
  }, [ACTIVE_KEY, userId]);

  const clearActive = useCallback(async () => {
    try {
      localStorage.removeItem(ACTIVE_KEY);
      if (firebaseEnabled && userId) {
        const { db } = getFirebase();
        await deleteDoc(doc(db, "users", userId, "state", "activeTimer"));
      }
    } catch {}
  }, [ACTIVE_KEY, userId]);

  // --- load active run on mount & listen for cross-device changes ---

  useEffect(() => {
    if (!userId) return;

    if (!firebaseEnabled) {
      // Fallback: Local storage only
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
      return;
    }

    // Firebase Enabled: Listen to the cloud document for real-time changes
    const { db } = getFirebase();
    const docRef = doc(db, "users", userId, "state", "activeTimer");
    const currentDeviceId = getDeviceId();

    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const remoteUpdatedAt = data.updatedAt || 0;
        const localUpdatedAt = taskIdRef.current ? (JSON.parse(localStorage.getItem(ACTIVE_KEY) || "{}")).updatedAt || 0 : 0;

        // Conflict resolution: latest timestamp wins
        // But only apply remote changes if they're newer and from a different device
        const isRemoteUpdate = data.deviceId && data.deviceId !== currentDeviceId;
        const isRemoteNewer = remoteUpdatedAt > localUpdatedAt;

        // Skip if this is our own update reflected back
        if (!isRemoteUpdate) {
          setActiveTaskId(data.taskId);
          taskIdRef.current = data.taskId;
          accumRef.current = data.accumulated || 0;

          if (data.startedAt) {
            startRef.current = data.startedAt;
            setRunning(true);
          } else {
            setRunning(false);
            setElapsed(data.accumulated || 0);
          }
        } else if (isRemoteNewer) {
          // Apply remote update if it's newer (conflict resolution)
          console.log("[useTimer] Applying remote timer state (conflict resolved)");
          setActiveTaskId(data.taskId);
          taskIdRef.current = data.taskId;
          accumRef.current = data.accumulated || 0;

          if (data.startedAt) {
            startRef.current = data.startedAt;
            setRunning(true);
          } else {
            setRunning(false);
            setElapsed(data.accumulated || 0);
          }
        }
      } else {
        // If the document was deleted (timer stopped remotely), clear it locally
        setActiveTaskId(null);
        taskIdRef.current = null;
        setRunning(false);
        setElapsed(0);
      }
    });

    return () => unsubscribe();
  }, [userId, ACTIVE_KEY]);

  // --- tick loop (optimized: throttle to 100ms instead of every frame) ---

  useEffect(() => {
    if (!running) return;
    
    let lastUpdate = 0;
    const TICK_INTERVAL = 100; // Update 10 times per second instead of 60
    
    const tick = (timestamp) => {
      if (!lastUpdate || timestamp - lastUpdate >= TICK_INTERVAL) {
        setElapsed(accumRef.current + (Date.now() - startRef.current));
        lastUpdate = timestamp;
      }
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
      
      // Call our updated persistActive to sync this new state immediately
      persistActive();
    },
    [saveCurrentSession, persistActive]
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