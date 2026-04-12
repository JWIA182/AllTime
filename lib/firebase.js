import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

/*
 * Firebase config is read from NEXT_PUBLIC_FIREBASE_* env vars at build time.
 * These are public values (Firebase API keys are not secrets — security comes
 * from Firestore rules) so it's fine to bake them into the static bundle.
 *
 * For local dev, put them in `.env.local`.
 * For GitHub Actions, put them in repo secrets and pass them as env in the
 * build step (see .github/workflows/deploy.yml).
 *
 * If no config is detected, `firebaseEnabled` will be false and the app will
 * fall back to the local-storage auth stub from `lib/auth.js` so you can keep
 * developing without a Firebase project.
 */

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseEnabled = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId
);

let _app = null;
let _auth = null;
let _db = null;

export function getFirebase() {
  if (!firebaseEnabled) return { app: null, auth: null, db: null };
  if (!_app) {
    _app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    _auth = getAuth(_app);

    // Enable offline persistence so writes queue when offline and
    // reads serve from cache. Multi-tab support lets multiple browser
    // tabs share the same cache without conflicts.
    if (getApps().length <= 1) {
      try {
        _db = initializeFirestore(_app, {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager(),
          }),
        });
      } catch {
        // Falls back if persistence is already initialized or unsupported
        _db = getFirestore(_app);
      }
    } else {
      _db = getFirestore(_app);
    }
  }
  return { app: _app, auth: _auth, db: _db };
}
