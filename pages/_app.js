import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { AuthProvider, localAuthAdapter } from "../lib/auth";
import { firebaseEnabled } from "../lib/firebase";
import { firebaseAuthAdapter } from "../lib/firebaseAuthAdapter";
import "../public/styles.css";

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

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.__BASE_PATH__ = basePath;
    }
  }, [basePath]);

  // Register service worker (production only)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker
      .register(`${basePath}/sw.js`, { scope: `${basePath}/` })
      .catch(() => {});
  }, [basePath]);

  return (
    <AuthProvider adapter={authAdapter}>
      <Head>
        <title>all time — count up timer</title>
        <meta
          name="description"
          content="A count-up timer for tracking how long you spend on things. Built for ADHD brains."
        />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />

        {/* Theme-color per color scheme (iOS respects the media attr) */}
        <meta
          name="theme-color"
          content="#1a1917"
          media="(prefers-color-scheme: dark)"
        />
        <meta
          name="theme-color"
          content="#f5f3ef"
          media="(prefers-color-scheme: light)"
        />

        {/* Apply theme before first paint — prevents flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=localStorage.getItem('alltime.theme')||'system';var t=p;if(p==='system')t=window.matchMedia('(prefers-color-scheme:light)').matches?'light':'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){}})()`,
          }}
        />

        {/* PWA manifest + icons */}
        <link rel="manifest" href={`${basePath}/manifest.webmanifest`} />
        <link rel="icon" href={`${basePath}/icon.svg`} type="image/svg+xml" />
        {/* iOS needs a PNG apple-touch-icon */}
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href={`${basePath}/apple-touch-icon.png`}
        />

        {/* iOS standalone-mode */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="apple-mobile-web-app-title" content="AllTime" />
      </Head>
      <Component {...pageProps} />
    </AuthProvider>
  );
}
