/*
 * Thin wrapper around the Notifications API.
 *
 * Important platform notes:
 *  - Desktop browsers + Android Chrome: works directly.
 *  - iOS Safari: notifications only fire when the site has been INSTALLED
 *    as a PWA via "Add to Home Screen" AND iOS >= 16.4. Until then,
 *    `getPermissionState()` will return "unsupported".
 */

export function isSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getPermissionState() {
  if (!isSupported()) return "unsupported";
  return Notification.permission; // "default" | "granted" | "denied"
}

export async function requestPermission() {
  if (!isSupported()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return "denied";
  }
}

export function notify(title, body, tag) {
  if (!isSupported() || Notification.permission !== "granted") return;
  try {
    new Notification(title, {
      body,
      tag,
      icon: typeof window !== "undefined" ? `${window.__BASE_PATH__ || ""}/icon.svg` : undefined,
      silent: false,
    });
  } catch {
    // some browsers throw if called outside a user gesture / on iOS without PWA
  }
}
