import { useCallback, useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { firebaseEnabled, getFirebase } from "./firebase";

/*
 * useSyncStatus - Tracks sync state for cross-device functionality
 * - Online/offline status
 * - Last sync timestamp
 * - Active device tracking
 */

const DEVICE_ID_KEY = "alltime.deviceId.v1";

function getOrCreateDeviceId() {
  try {
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  } catch {
    return `device_fallback_${Date.now()}`;
  }
}

export function getDeviceId() {
  return getOrCreateDeviceId();
}

export function useSyncStatus({ userId }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastSync, setLastSync] = useState(null);
  const [activeDeviceId, setActiveDeviceId] = useState(null);
  const [syncError, setSyncError] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const onlineSinceRef = useRef(Date.now());
  const syncAttemptsRef = useRef(0);

  const deviceId = getDeviceId();

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      onlineSinceRef.current = Date.now();
      syncAttemptsRef.current = 0;
      setSyncError(false);
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      setSyncError(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Listen to active timer state for sync detection
  useEffect(() => {
    if (!userId || !firebaseEnabled) return;

    const { db } = getFirebase();
    const docRef = doc(db, "users", userId, "state", "activeTimer");

    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        const now = Date.now();
        setLastSync(now);
        setIsSyncing(false);
        syncAttemptsRef.current = 0;
        
        if (snap.exists()) {
          const data = snap.data();
          setActiveDeviceId(data.deviceId || null);
        } else {
          setActiveDeviceId(null);
        }
      },
      (error) => {
        console.error("[useSyncStatus] Sync error:", error);
        setSyncError(true);
        setIsSyncing(false);
        syncAttemptsRef.current++;
      }
    );

    return () => unsubscribe();
  }, [userId]);

  const markSyncStart = useCallback(() => {
    setIsSyncing(true);
    setSyncError(false);
  }, []);

  const markSyncComplete = useCallback(() => {
    setIsSyncing(false);
    setLastSync(Date.now());
    syncAttemptsRef.current = 0;
  }, []);

  const markSyncFailed = useCallback(() => {
    setIsSyncing(false);
    setSyncError(true);
    syncAttemptsRef.current++;
  }, []);

  // Determine sync status for UI
  const syncState = (() => {
    if (!firebaseEnabled) return { status: "local", label: "Local Mode", icon: "○" };
    if (!isOnline) return { status: "offline", label: "Offline", icon: "○" };
    if (isSyncing) return { status: "syncing", label: "Syncing...", icon: "◐" };
    if (syncError) return { status: "error", label: "Sync Error", icon: "✕" };
    
    const timeSinceSync = lastSync ? Date.now() - lastSync : null;
    const recentlySynced = timeSinceSync && timeSinceSync < 10000; // 10 seconds
    
    if (recentlySynced) return { status: "synced", label: "Synced", icon: "●" };
    if (timeSinceSync) return { status: "stale", label: "Sync Stale", icon: "◐" };
    return { status: "connecting", label: "Connecting...", icon: "◐" };
  })();

  // Check if timer was started on a different device
  const isRemoteActive = activeDeviceId && activeDeviceId !== deviceId;

  return {
    deviceId,
    isOnline,
    lastSync,
    isSyncing,
    syncError,
    syncState,
    activeDeviceId,
    isRemoteActive,
    markSyncStart,
    markSyncComplete,
    markSyncFailed,
  };
}
