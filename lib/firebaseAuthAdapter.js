import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import { getFirebase } from "./firebase";

/*
 * Firebase Auth implementation of the auth adapter interface defined in
 * lib/auth.js. The adapter exposes:
 *
 *   signup(email, password, displayName) -> { user }
 *   login(email, password)               -> { user }
 *   logout()                             -> void
 *   subscribe(callback)                  -> unsubscribe
 *
 * `user` shape (normalized so the rest of the app doesn't see Firebase types):
 *   { id, email, displayName, createdAt }
 */

function toUser(fbUser) {
  if (!fbUser) return null;
  return {
    id: fbUser.uid,
    email: fbUser.email || "",
    displayName:
      fbUser.displayName ||
      (fbUser.email ? fbUser.email.split("@")[0] : "user"),
    createdAt: fbUser.metadata?.creationTime || null,
  };
}

function friendlyError(err) {
  const code = err?.code || "";
  switch (code) {
    case "auth/invalid-email":
      return "That doesn't look like a valid email";
    case "auth/missing-password":
    case "auth/weak-password":
      return "Password must be at least 6 characters";
    case "auth/email-already-in-use":
      return "An account with that email already exists";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Invalid email or password";
    case "auth/network-request-failed":
      return "Network error — check your connection";
    default:
      return err?.message || "Something went wrong";
  }
}

export const firebaseAuthAdapter = {
  async signup(email, password, displayName) {
    const { auth } = getFirebase();
    try {
      const cred = await createUserWithEmailAndPassword(
        auth,
        (email || "").trim(),
        password
      );
      const trimmed = (displayName || "").trim();
      if (trimmed) {
        await updateProfile(cred.user, { displayName: trimmed });
      }
      return { user: toUser(cred.user) };
    } catch (err) {
      throw new Error(friendlyError(err));
    }
  },

  async login(email, password) {
    const { auth } = getFirebase();
    try {
      const cred = await signInWithEmailAndPassword(
        auth,
        (email || "").trim(),
        password
      );
      return { user: toUser(cred.user) };
    } catch (err) {
      throw new Error(friendlyError(err));
    }
  },

  async logout() {
    const { auth } = getFirebase();
    await signOut(auth);
  },

  subscribe(callback) {
    const { auth } = getFirebase();
    return onAuthStateChanged(auth, (fbUser) => callback(toUser(fbUser)));
  },
};
