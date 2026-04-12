import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { firebaseEnabled, getFirebase } from "./firebase";

/*
 * Tasks CRUD. Mirrors the two-backend pattern from sessions.js.
 *
 * Task shape: { id, name, color, createdAt }
 *
 * Firestore path: users/{uid}/tasks/{taskId}
 * localStorage key: alltime.tasks.v1:{userId}
 *
 * Updated Firestore rules (wildcard covers both tasks + sessions):
 *
 *   rules_version = '2';
 *   service cloud.firestore {
 *     match /databases/{database}/documents {
 *       match /users/{userId}/{document=**} {
 *         allow read, write: if request.auth != null
 *                            && request.auth.uid == userId;
 *       }
 *     }
 *   }
 */

/* ---------- localStorage fallback ---------- */

const LS_KEY = (uid) => `alltime.tasks.v1:${uid}`;

function lsRead(uid) {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY(uid)) || "[]");
  } catch {
    return [];
  }
}

function lsWrite(uid, tasks) {
  try {
    localStorage.setItem(LS_KEY(uid), JSON.stringify(tasks));
  } catch {}
}

const localTasksBackend = {
  subscribe(uid, cb) {
    cb(lsRead(uid));
    const onStorage = (e) => {
      if (e.key === LS_KEY(uid)) cb(lsRead(uid));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  },

  async add(uid, task) {
    const entry = {
      ...task,
      id: String(Date.now()),
      createdAt: new Date().toISOString(),
    };
    lsWrite(uid, [...lsRead(uid), entry]);
    return entry;
  },

  async update(uid, taskId, updates) {
    lsWrite(
      uid,
      lsRead(uid).map((t) => (t.id === taskId ? { ...t, ...updates } : t))
    );
  },

  async remove(uid, taskId) {
    lsWrite(
      uid,
      lsRead(uid).filter((t) => t.id !== taskId)
    );
  },
};

/* ---------- Firestore backend ---------- */

function tasksCol(db, uid) {
  return collection(db, "users", uid, "tasks");
}

function fromDoc(d) {
  const data = d.data();
  return {
    id: d.id,
    name: data.name || "Untitled",
    color: data.color || "#6b9e78",
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
  };
}

const firestoreTasksBackend = {
  subscribe(uid, cb) {
    const { db } = getFirebase();
    const q = query(tasksCol(db, uid), orderBy("createdAt", "asc"));
    return onSnapshot(
      q,
      (snap) => cb(snap.docs.map(fromDoc)),
      (err) => {
        console.error("[tasks] subscribe error:", err);
        cb([]);
      }
    );
  },

  async add(uid, task) {
    const { db } = getFirebase();
    const ref = await addDoc(tasksCol(db, uid), {
      name: task.name,
      color: task.color,
      createdAt: serverTimestamp(),
    });
    return { ...task, id: ref.id };
  },

  async update(uid, taskId, updates) {
    const { db } = getFirebase();
    const allowed = {};
    if (updates.name !== undefined) allowed.name = updates.name;
    if (updates.color !== undefined) allowed.color = updates.color;
    await updateDoc(doc(db, "users", uid, "tasks", taskId), allowed);
  },

  async remove(uid, taskId) {
    const { db } = getFirebase();
    await deleteDoc(doc(db, "users", uid, "tasks", taskId));
  },
};

/* ---------- public API ---------- */

const backend = firebaseEnabled ? firestoreTasksBackend : localTasksBackend;

export const subscribeTasks = (uid, cb) => backend.subscribe(uid, cb);
export const addTask = (uid, task) => backend.add(uid, task);
export const updateTask = (uid, taskId, updates) =>
  backend.update(uid, taskId, updates);
export const deleteTask = (uid, taskId) => backend.remove(uid, taskId);
