import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { firebaseEnabled, getFirebase } from "./firebase";

/*
 * Goals CRUD - Goal setting and tracking
 * 
 * Goal shape: { id, taskId, taskName, targetMinutes, period, createdAt }
 * Period: 'daily' | 'weekly'
 * 
 * Firestore path: users/{uid}/goals/{goalId}
 * localStorage key: alltime.goals.v1:{userId}
 */

const LS_KEY = (uid) => `alltime.goals.v1:${uid}`;

function lsRead(uid) {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY(uid)) || "[]");
  } catch {
    return [];
  }
}

function lsWrite(uid, goals) {
  try {
    localStorage.setItem(LS_KEY(uid), JSON.stringify(goals));
  } catch {}
}

const localGoalsBackend = {
  subscribe(uid, cb) {
    cb(lsRead(uid));
    const onStorage = (e) => {
      if (e.key === LS_KEY(uid)) cb(lsRead(uid));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  },

  async add(uid, goal) {
    const entry = {
      ...goal,
      id: String(Date.now()),
      createdAt: new Date().toISOString(),
    };
    lsWrite(uid, [...lsRead(uid), entry]);
    return entry;
  },

  async update(uid, goalId, updates) {
    lsWrite(
      uid,
      lsRead(uid).map((g) => (g.id === goalId ? { ...g, ...updates } : g))
    );
  },

  async remove(uid, goalId) {
    lsWrite(
      uid,
      lsRead(uid).filter((g) => g.id !== goalId)
    );
  },
};

function goalsCol(db, uid) {
  return collection(db, "users", uid, "goals");
}

function fromDoc(d) {
  const data = d.data();
  return {
    id: d.id,
    taskId: data.taskId || null,
    taskName: data.taskName || "Untitled",
    targetMinutes: data.targetMinutes || 60,
    period: data.period || "daily",
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
  };
}

const firestoreGoalsBackend = {
  subscribe(uid, cb) {
    const { db } = getFirebase();
    const q = query(goalsCol(db, uid), orderBy("createdAt", "asc"));
    return onSnapshot(
      q,
      (snap) => cb(snap.docs.map(fromDoc)),
      (err) => {
        console.error("[goals] subscribe error:", err);
        cb([]);
      }
    );
  },

  async add(uid, goal) {
    const { db } = getFirebase();
    const ref = await addDoc(goalsCol(db, uid), {
      taskId: goal.taskId,
      taskName: goal.taskName,
      targetMinutes: goal.targetMinutes,
      period: goal.period || "daily",
      createdAt: serverTimestamp(),
    });
    return { ...goal, id: ref.id };
  },

  async update(uid, goalId, updates) {
    const { db } = getFirebase();
    const allowed = {};
    if (updates.taskId !== undefined) allowed.taskId = updates.taskId;
    if (updates.taskName !== undefined) allowed.taskName = updates.taskName;
    if (updates.targetMinutes !== undefined) allowed.targetMinutes = updates.targetMinutes;
    if (updates.period !== undefined) allowed.period = updates.period;
    await updateDoc(doc(db, "users", uid, "goals", goalId), allowed);
  },

  async remove(uid, goalId) {
    const { db } = getFirebase();
    await deleteDoc(doc(db, "users", uid, "goals", goalId));
  },
};

const backend = firebaseEnabled ? firestoreGoalsBackend : localGoalsBackend;

export const subscribeGoals = (uid, cb) => backend.subscribe(uid, cb);
export const addGoal = (uid, goal) => backend.add(uid, goal);
export const updateGoal = (uid, goalId, updates) => backend.update(uid, goalId, updates);
export const deleteGoal = (uid, goalId) => backend.remove(uid, goalId);

/*
 * Calculate goal progress
 * Returns: { completedMinutes, targetMinutes, percent, completed }
 */
export function calculateGoalProgress(goal, sessions, periodStart) {
  const goalSessions = sessions.filter((s) => {
    const sessionDate = new Date(s.endedAt);
    const matchesTask = !goal.taskId || s.taskId === goal.taskId;
    const inPeriod = sessionDate >= periodStart;
    return matchesTask && inPeriod;
  });

  const completedMinutes = goalSessions.reduce((sum, s) => sum + s.ms / 60000, 0);
  const targetMinutes = goal.targetMinutes;
  const percent = Math.min(100, (completedMinutes / targetMinutes) * 100);
  const completed = completedMinutes >= targetMinutes;

  return {
    completedMinutes: Math.round(completedMinutes),
    targetMinutes,
    percent: Math.round(percent),
    completed,
  };
}
