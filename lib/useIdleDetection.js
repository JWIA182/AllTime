import { useCallback, useEffect, useRef, useState } from "react";

/*
 * useIdleDetection — auto-pauses the timer when the user goes idle.
 *
 * Uses mouse/keyboard/touch activity as a proxy. If no activity is
 * detected for `idleTimeout` ms while the timer is running, fires
 * `onIdle()`. When the user returns, fires `onReturn()`.
 *
 * The Idle Detection API (IdleDetector) is Chrome-only and requires
 * permission, so we use the more universal input-event approach.
 *
 * Returns { idleState, idleSince, dismissIdle }
 *   idleState: "active" | "idle" | "returned"
 *   idleSince: timestamp when idle began (for calculating missed time)
 */

const IDLE_TIMEOUT = 15 * 60 * 1000; // 15 minutes

export function useIdleDetection({ running, onIdle, onReturn }) {
  const [idleState, setIdleState] = useState("active"); // "active" | "idle" | "returned"
  const [idleSince, setIdleSince] = useState(null);
  const timerRef = useRef(null);
  const onIdleRef = useRef(onIdle);
  const onReturnRef = useRef(onReturn);

  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);
  useEffect(() => {
    onReturnRef.current = onReturn;
  }, [onReturn]);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setIdleState("idle");
      setIdleSince(Date.now());
      if (onIdleRef.current) onIdleRef.current();
    }, IDLE_TIMEOUT);
  }, []);

  useEffect(() => {
    if (!running) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setIdleState("active");
      setIdleSince(null);
      return;
    }

    const onActivity = () => {
      if (idleState === "idle") {
        setIdleState("returned");
        // Don't auto-resume — show the "were you still working?" dialog
        return;
      }
      resetTimer();
    };

    resetTimer();

    const events = ["mousemove", "keydown", "mousedown", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [running, idleState, resetTimer]);

  const dismissIdle = useCallback(
    (wasWorking) => {
      setIdleState("active");
      setIdleSince(null);
      if (onReturnRef.current) onReturnRef.current(wasWorking, idleSince);
      resetTimer();
    },
    [idleSince, resetTimer]
  );

  return { idleState, idleSince, dismissIdle };
}
