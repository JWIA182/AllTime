import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import { firebaseEnabled, getFirebase } from "./firebase";

/*
 * Sessions storage. Two backends:
 *
 *   1. Firestore (when Firebase is configured)
 *      - Path: users/{uid}/sessions/{sessionId}
 *      - Live updates via onSnapshot
 *      - Required Firestore rules:
 *
 *          rules_version = '2';
 *          service cloud.firestore {
 *            match /databases/{database}/documents {
 *              match /users/{userId}/sessions/{sessionId} {
 *                allow read, write: if request.auth != null
 *                                   && request.auth.uid == userId;
 *              }
 *            }
 *          }
 *
 *   2. localStorage fallback (when Firebase is NOT configured)
 *      - Key: alltime.sessions.v1:{userId}
 *      - Lets you keep building locally before creating a Firebase project
 *
 * Session shape (in app code): { id, task, ms, endedAt }
 *   - id:      string (Firestore doc id, or millisecond timestamp for local)
 *   - task:    string
 *   - ms:      number  (duration in milliseconds)
 *   - endedAt: ISO string
 */

/* ---------- localStorage fallback ---------- */

const LS_KEY = (userId) => `alltime.sessions.v1:${userId}`;

function lsRead(userId) {
  try {
    const raw = localStorage.getItem(LS_KEY(userId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function lsWrite(userId, sessions) {
  try {
    localStorage.setItem(LS_KEY(userId), JSON.stringify(sessions));
  } catch {}
}

const localSessionsBackend = {
  subscribe(userId, callback) {
    callback(lsRead(userId));
    const onStorage = (e) => {
      if (e.key === LS_KEY(userId)) callback(lsRead(userId));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  },

  async add(userId, session) {
    const entry = { ...session, id: String(Date.now()) };
    const next = [entry, ...lsRead(userId)];
    lsWrite(userId, next);
    return entry;
  },

  async remove(userId, id) {
    lsWrite(
      userId,
      lsRead(userId).filter((s) => s.id !== id)
    );
  },

  async clear(userId) {
    lsWrite(userId, []);
  },
};

/* ---------- Firestore backend ---------- */

function sessionsCol(db, userId) {
  return collection(db, "users", userId, "sessions");
}

function fromDoc(d) {
  const data = d.data();
  let endedAt = data.endedAt;
  if (endedAt instanceof Timestamp) endedAt = endedAt.toDate().toISOString();
  else if (endedAt?.toDate) endedAt = endedAt.toDate().toISOString();
  else if (typeof endedAt !== "string") endedAt = new Date().toISOString();
  return {
    id: d.id,
    task: data.task || "Untitled",
    ms: data.ms || 0,
    endedAt,
  };
}

const firestoreSessionsBackend = {
  subscribe(userId, callback) {
    const { db } = getFirebase();
    const q = query(sessionsCol(db, userId), orderBy("endedAt", "desc"));
    return onSnapshot(
      q,
      (snap) => callback(snap.docs.map(fromDoc)),
      (err) => {
        // eslint-disable-next-line no-console
        console.error("[sessions] subscribe error:", err);
        callback([]);
      }
    );
  },

  async add(userId, session) {
    const { db } = getFirebase();
    const ref = await addDoc(sessionsCol(db, userId), {
      task: session.task,
      ms: session.ms,
      endedAt: Timestamp.fromDate(new Date(session.endedAt)),
      createdAt: serverTimestamp(),
    });
    return { ...session, id: ref.id };
  },

  async remove(userId, id) {
    const { db } = getFirebase();
    await deleteDoc(doc(db, "users", userId, "sessions", id));
  },

  async clear(userId) {
    const { db } = getFirebase();
    const snap = await getDocs(sessionsCol(db, userId));
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  },
};

/* ---------- chooser ---------- */

const backend = firebaseEnabled ? firestoreSessionsBackend : localSessionsBackend;

export const subscribeSessions = (userId, callback) =>
  backend.subscribe(userId, callback);
export const addSession = (userId, session) => backend.add(userId, session);
export const removeSession = (userId, id) => backend.remove(userId, id);
export const clearSessions = (userId) => backend.clear(userId);
