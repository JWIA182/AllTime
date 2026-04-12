import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

/*
 * AUTH ADAPTER INTERFACE
 * ----------------------
 * Implementations:
 *   - localAuthAdapter        (this file, dev stub)
 *   - firebaseAuthAdapter     (lib/firebaseAuthAdapter.js, real backend)
 *
 * Methods:
 *   signup(email, password, displayName) -> { user }      // throws on failure
 *   login(email, password)               -> { user }      // throws on failure
 *   logout()                             -> void
 *   subscribe(callback)                  -> unsubscribe   // fires once with
 *                                                         // current user, then
 *                                                         // on every change
 *
 * `user` shape: { id, email, displayName, createdAt }
 *
 * The local stub stores accounts in localStorage with SHA-256 hashed passwords.
 * It exists so you can keep developing without a backend. Do not ship it.
 */

const USERS_KEY = "alltime.users.v1";
const CURRENT_KEY = "alltime.current_user.v1";

/* --- password hashing via Web Crypto API --- */

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function readUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function stripPassword(record) {
  if (!record) return null;
  const { passwordHash, password, ...user } = record;
  return user;
}

function currentUserSync() {
  try {
    const raw = localStorage.getItem(CURRENT_KEY);
    if (!raw) return null;
    const { email } = JSON.parse(raw);
    return stripPassword(readUsers()[email]);
  } catch {
    return null;
  }
}

const listeners = new Set();
function notify() {
  const user = currentUserSync();
  listeners.forEach((cb) => {
    try {
      cb(user);
    } catch {}
  });
}

export const localAuthAdapter = {
  async signup(email, password, displayName) {
    email = (email || "").trim().toLowerCase();
    if (!email) throw new Error("Email is required");
    if (!password || password.length < 4)
      throw new Error("Password must be at least 4 characters");
    const users = readUsers();
    if (users[email]) throw new Error("An account with that email already exists");
    const user = {
      id:
        (typeof crypto !== "undefined" && crypto.randomUUID && crypto.randomUUID()) ||
        `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      email,
      displayName: (displayName || "").trim() || email.split("@")[0],
      createdAt: new Date().toISOString(),
    };
    const passwordHash = await hashPassword(password);
    users[email] = { ...user, passwordHash };
    writeUsers(users);
    localStorage.setItem(CURRENT_KEY, JSON.stringify({ email }));
    notify();
    return { user };
  },

  async login(email, password) {
    email = (email || "").trim().toLowerCase();
    const users = readUsers();
    const record = users[email];
    if (!record) throw new Error("Invalid email or password");

    // Support both hashed and legacy plaintext passwords (auto-migrate)
    if (record.passwordHash) {
      const hash = await hashPassword(password);
      if (hash !== record.passwordHash) throw new Error("Invalid email or password");
    } else if (record.password) {
      // Legacy plaintext — verify then migrate to hashed
      if (record.password !== password) throw new Error("Invalid email or password");
      record.passwordHash = await hashPassword(password);
      delete record.password;
      writeUsers(users);
    } else {
      throw new Error("Invalid email or password");
    }

    localStorage.setItem(CURRENT_KEY, JSON.stringify({ email }));
    notify();
    return { user: stripPassword(record) };
  },

  async logout() {
    localStorage.removeItem(CURRENT_KEY);
    notify();
  },

  subscribe(callback) {
    listeners.add(callback);
    Promise.resolve().then(() => callback(currentUserSync()));
    return () => listeners.delete(callback);
  },
};

const AuthContext = createContext(null);

export function AuthProvider({ children, adapter = localAuthAdapter }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = adapter.subscribe((u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, [adapter]);

  const login = useCallback(
    async (email, password) => {
      await adapter.login(email, password);
    },
    [adapter]
  );

  const signup = useCallback(
    async (email, password, displayName) => {
      await adapter.signup(email, password, displayName);
    },
    [adapter]
  );

  const logout = useCallback(async () => {
    await adapter.logout();
  }, [adapter]);

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
