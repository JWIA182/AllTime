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

        {/* Theme-color for white theme */}
        <meta name="theme-color" content="#ffffff" />

        {/* iOS status bar - white background */}
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />

        {/* Apply theme before first paint — prevents flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=localStorage.getItem('alltime.theme')||'light';var t=p;if(p==='system')t=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';document.documentElement.setAttribute('data-theme',t);if(t==='dark'){document.querySelector('meta[name="theme-color"]').content='#0a0a0a';document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]').content='black-translucent';}}catch(e){}})()`,
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
