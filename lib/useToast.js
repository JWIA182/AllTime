import { useCallback, useState } from "react";

/*
 * useToast — lightweight toast notifications with optional undo.
 *
 * Replaces window.confirm() and window.alert() with non-blocking,
 * ADHD-friendly toasts. Destructive actions happen immediately and
 * show an undo option for 5 seconds. Impulse-friendly: if the user
 * hit delete by accident, they can undo without penalty.
 *
 * Usage:
 *   const { toasts, showToast, dismissToast } = useToast();
 *   showToast("Task deleted", () => undoDelete());
 */

let idCounter = 0;

export function useToast(duration = 5000) {
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message, onUndo) => {
      const id = ++idCounter;
      const toast = { id, message, onUndo: onUndo || null };
      setToasts((prev) => [...prev, toast]);

      // Auto-dismiss after duration
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);

      return id;
    },
    [duration]
  );

  const handleUndo = useCallback(
    (id) => {
      const toast = toasts.find((t) => t.id === id);
      if (toast?.onUndo) toast.onUndo();
      dismissToast(id);
    },
    [toasts, dismissToast]
  );

  return { toasts, showToast, dismissToast, handleUndo };
}
