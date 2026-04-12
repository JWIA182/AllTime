import { useCallback, useEffect, useState } from "react";

/*
 * useBrainDump — "Park It" feature for ADHD brains.
 *
 * While timing a task, stray thoughts ("buy milk", "email Sarah") can be
 * quickly typed and parked so they don't derail focus. Stored per-user in
 * localStorage. Lightweight by design — these are throwaway notes, not a
 * full todo system.
 *
 * Shape: { id, text, createdAt }
 */

const KEY = (uid) => `alltime.braindump.v1:${uid}`;

function read(uid) {
  try {
    return JSON.parse(localStorage.getItem(KEY(uid)) || "[]");
  } catch {
    return [];
  }
}

function write(uid, items) {
  try {
    localStorage.setItem(KEY(uid), JSON.stringify(items));
  } catch {}
}

export function useBrainDump(userId) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    setItems(read(userId));
  }, [userId]);

  const add = useCallback(
    (text) => {
      const trimmed = (text || "").trim();
      if (!trimmed) return;
      const entry = {
        id: `bd_${Date.now()}`,
        text: trimmed,
        createdAt: new Date().toISOString(),
      };
      const next = [entry, ...read(userId)];
      write(userId, next);
      setItems(next);
    },
    [userId]
  );

  const remove = useCallback(
    (id) => {
      const next = read(userId).filter((i) => i.id !== id);
      write(userId, next);
      setItems(next);
      return items.find((i) => i.id === id); // return removed for undo
    },
    [userId, items]
  );

  const restore = useCallback(
    (item) => {
      if (!item) return;
      const current = read(userId);
      // Re-insert at original position (or front)
      const next = [item, ...current];
      write(userId, next);
      setItems(next);
    },
    [userId]
  );

  const clear = useCallback(() => {
    write(userId, []);
    setItems([]);
  }, [userId]);

  return { items, add, remove, restore, clear };
}
