import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { AuthProvider, localAuthAdapter } from "../lib/auth";
import { firebaseEnabled } from "../lib/firebase";
import { firebaseAuthAdapter } from "../lib/firebaseAuthAdapter";
import "../public/styles.css";

// Pick the adapter based on whether Firebase env vars are present at build time.
const authAdapter = firebaseEnabled ? firebaseAuthAdapter : localAuthAdapter;

if (typeof window !== "undefined" && !firebaseEnabled) {
  // eslint-disable-next-line no-console
  console.warn(
    "[all time] Firebase config not detected — using local auth stub. " +
      "Set NEXT_PUBLIC_FIREBASE_* env vars to use Firebase."
  );
}

export default function MyApp({ Component, pageProps }) {
  const router = useRouter();
  const basePath = router.basePath || "";

  // Expose basePath to non-React modules (e.g. lib/notifications.js icon path)
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.__BASE_PATH__ = basePath;
    }
  }, [basePath]);

  // Register the service worker for offline + installability
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    const url = `${basePath}/sw.js`;
    navigator.serviceWorker
      .register(url, { scope: `${basePath}/` })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn("[all time] service worker registration failed:", err);
      });
  }, [basePath]);

  return (
    <AuthProvider adapter={authAdapter}>
      <Head>
        <title>all time — count up timer</title>
        <meta
          name="description"
          content="A count-up timer for tracking how long you spend on things. Built for ADHD brains."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#fafaf9" />

        {/* PWA */}
        <link rel="manifest" href={`${basePath}/manifest.webmanifest`} />
        <link rel="icon" href={`${basePath}/icon.svg`} type="image/svg+xml" />
        <link rel="apple-touch-icon" href={`${basePath}/icon.svg`} />

        {/* iOS standalone-mode polish */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="all time" />
      </Head>
      <Component {...pageProps} />
    </AuthProvider>
  );
}
