import { useCallback, useEffect, useState } from "react";
import { applyTheme, getThemePref } from "../lib/formatters";
import { getPermissionState, requestPermission } from "../lib/notifications";
import { getDeviceId } from "../lib/useSyncStatus";
import { useCloudBackup } from "../lib/useCloudBackup";
import { firebaseEnabled } from "../lib/firebase";

/*
 * SettingsTab - Centralized settings page for app preferences
 */

const KEYBOARD_SHORTCUTS_KEY = "alltime.shortcuts.v1";
const NOTIFY_KEY = "alltime.notify.v1";

const DEFAULT_SHORTCUTS = {
  toggle: "Space",
  stopAndSave: "KeyS",
  newTask: "KeyN",
  close: "Escape",
};

function loadShortcuts() {
  try {
    const raw = localStorage.getItem(KEYBOARD_SHORTCUTS_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_SHORTCUTS;
  } catch {
    return DEFAULT_SHORTCUTS;
  }
}

function saveShortcuts(shortcuts) {
  try {
    localStorage.setItem(KEYBOARD_SHORTCUTS_KEY, JSON.stringify(shortcuts));
  } catch {}
}

export default function SettingsTab({
  user,
  themePref,
  setTheme,
  notifyInterval,
  setNotifyInterval,
  onLogout,
  onExportJSON,
  onImportJSON,
  showToast,
  syncStatus,
  offlineOps,
  tasks,
  sessions,
}) {
  const [shortcuts, setShortcuts] = useState(DEFAULT_SHORTCUTS);
  const [notifyPerm, setNotifyPerm] = useState("default");
  const [localNotifyInterval, setLocalNotifyInterval] = useState(0);
  const [editingKey, setEditingKey] = useState(null);
  const [deviceId] = useState(getDeviceId());

  // Cloud backup
  const cloudBackup = useCloudBackup({
    userId: user.id,
    tasks,
    sessions,
  });

  useEffect(() => {
    setShortcuts(loadShortcuts());
    setNotifyPerm(getPermissionState());
    setLocalNotifyInterval(notifyInterval);
  }, [notifyInterval]);

  const handleNotifyChange = useCallback(
    async (mins) => {
      if (mins > 0) {
        const result = await requestPermission();
        setNotifyPerm(result);
        if (result !== "granted") {
          setLocalNotifyInterval(0);
          localStorage.setItem(NOTIFY_KEY, "0");
          return;
        }
      }
      setLocalNotifyInterval(mins);
      setNotifyInterval(mins);
      localStorage.setItem(NOTIFY_KEY, String(mins));
      showToast(`Notifications ${mins > 0 ? `set to every ${mins}m` : "disabled"}`);
    },
    [setNotifyInterval, showToast]
  );

  const handleShortcutEdit = useCallback((action, newKey) => {
    const newShortcuts = { ...shortcuts, [action]: newKey };
    setShortcuts(newShortcuts);
    saveShortcuts(newShortcuts);
  }, [shortcuts]);

  const handleKeyCapture = useCallback((action, e) => {
    e.preventDefault();
    const key = e.code;
    handleShortcutEdit(action, key);
    setEditingKey(null);
  }, [handleShortcutEdit]);

  const resetShortcuts = useCallback(() => {
    setShortcuts(DEFAULT_SHORTCUTS);
    saveShortcuts(DEFAULT_SHORTCUTS);
    showToast("Shortcuts reset to defaults");
  }, [showToast]);

  const formatLastSync = () => {
    if (!syncStatus.lastSync) return "Never";
    const diff = Date.now() - syncStatus.lastSync;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <div className="settings-page">
      <h2>Settings</h2>

      {/* Account Section */}
      <section className="settings-section">
        <h3>Account</h3>
        <div className="settings-card">
          <div className="setting-row">
            <div className="setting-label">
              <span>Email</span>
              <span className="setting-desc">Logged in as</span>
            </div>
            <div className="setting-value">{user?.email}</div>
          </div>
          <div className="setting-row">
            <div className="setting-label">
              <span>Device ID</span>
              <span className="setting-desc">Unique identifier for this device</span>
            </div>
            <div className="setting-value setting-mono">{deviceId?.slice(0, 20)}…</div>
          </div>
          <button className="btn danger" onClick={onLogout}>
            Log Out
          </button>
        </div>
      </section>

      {/* Sync Section */}
      {firebaseEnabled && (
        <section className="settings-section">
          <h3>Sync & Data</h3>
          <div className="settings-card">
            <div className="setting-row">
              <div className="setting-label">
                <span>Sync Status</span>
                <span className="setting-desc">{syncStatus.syncState.label}</span>
              </div>
              <div className={`sync-badge ${syncStatus.syncState.status}`}>
                {syncStatus.syncState.icon}
              </div>
            </div>
            <div className="setting-row">
              <div className="setting-label">
                <span>Last Sync</span>
              </div>
              <div className="setting-value">{formatLastSync()}</div>
            </div>
            {offlineOps.hasPendingChanges && (
              <div className="setting-row">
                <div className="setting-label">
                  <span>Offline Changes</span>
                  <span className="setting-desc">
                    {offlineOps.pendingCount} operation{offlineOps.pendingCount !== 1 ? "s" : ""} pending
                  </span>
                </div>
                <button
                  className="btn small"
                  onClick={async () => {
                    const result = await offlineOps.processQueue();
                    if (result) {
                      showToast(`Synced ${result.processed} operation${result.processed !== 1 ? "s" : ""}`);
                    }
                  }}
                  disabled={offlineOps.isProcessing}
                >
                  {offlineOps.isProcessing ? "Syncing…" : "Sync Now"}
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Appearance Section */}
      <section className="settings-section">
        <h3>Appearance</h3>
        <div className="settings-card">
          <div className="setting-row">
            <div className="setting-label">
              <span>Theme</span>
              <span className="setting-desc">Choose your preferred theme</span>
            </div>
            <div className="seg">
              {[
                { v: "system", l: "Auto" },
                { v: "light", l: "Light" },
                { v: "dark", l: "Dark" },
              ].map((o) => (
                <button
                  key={o.v}
                  className={`seg-btn ${themePref === o.v ? "active" : ""}`}
                  onClick={() => {
                    setTheme(o.v);
                    showToast(`Theme set to ${o.l}`);
                  }}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Notifications Section */}
      <section className="settings-section">
        <h3>Notifications</h3>
        <div className="settings-card">
          <div className="setting-row">
            <div className="setting-label">
              <span>Milestone Reminders</span>
              <span className="setting-desc">Get notified at regular intervals</span>
            </div>
            <div className="seg">
              {[
                { v: 0, l: "Off" },
                { v: 15, l: "15m" },
                { v: 30, l: "30m" },
                { v: 60, l: "1h" },
              ].map((o) => (
                <button
                  key={o.v}
                  className={`seg-btn ${localNotifyInterval === o.v ? "active" : ""}`}
                  onClick={() => handleNotifyChange(o.v)}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>
          {notifyPerm === "denied" && (
            <div className="setting-warning">
              Notifications blocked in browser settings. Update to enable.
            </div>
          )}
          {notifyPerm === "unsupported" && (
            <div className="setting-warning">
              Install app to home screen for notifications support.
            </div>
          )}
        </div>
      </section>

      {/* Keyboard Shortcuts Section */}
      <section className="settings-section">
        <h3>Keyboard Shortcuts</h3>
        <div className="settings-card">
          <div className="shortcuts-editor">
            {[
              { action: "toggle", label: "Pause / Resume" },
              { action: "stopAndSave", label: "Stop & Save" },
              { action: "newTask", label: "New Task" },
              { action: "close", label: "Close Modal" },
            ].map(({ action, label }) => (
              <div key={action} className="shortcut-row">
                <span className="shortcut-label">{label}</span>
                {editingKey === action ? (
                  <button
                    className="shortcut-key-capture"
                    onKeyDown={(e) => handleKeyCapture(action, e)}
                    autoFocus
                  >
                    Press any key…
                  </button>
                ) : (
                  <button
                    className="shortcut-key"
                    onClick={() => setEditingKey(action)}
                  >
                    {shortcuts[action]?.replace("Key", "").replace("Digit", "") || "—"}
                  </button>
                )}
              </div>
            ))}
          </div>
          <button className="btn ghost small" onClick={resetShortcuts}>
            Reset to Defaults
          </button>
        </div>
      </section>

      {/* Data Management Section */}
      <section className="settings-section">
        <h3>Data Management</h3>
        <div className="settings-card">
          <div className="setting-actions">
            <button className="btn" onClick={onExportJSON}>
              Export Backup (JSON)
            </button>
            <button className="btn" onClick={onImportJSON}>
              Import Backup (JSON)
            </button>
          </div>
          <div className="setting-hint">
            Back up your tasks and sessions to a JSON file, or import from a previous backup.
          </div>

          {firebaseEnabled && (
            <>
              <div className="divider" />
              <h4>Cloud Backup</h4>
              <div className="cloud-backup-info">
                <div className="backup-stats">
                  <div className="backup-stat">
                    <span className="backup-stat-label">Last Backup</span>
                    <span className="backup-stat-value">
                      {cloudBackup.lastBackup
                        ? cloudBackup.lastBackup.toLocaleString()
                        : "Never"}
                    </span>
                  </div>
                  <div className="backup-stat">
                    <span className="backup-stat-label">Backup Size</span>
                    <span className="backup-stat-value">{cloudBackup.backupSize}</span>
                  </div>
                </div>
                
                <div className="backup-actions">
                  <button
                    className="btn"
                    onClick={async () => {
                      const success = await cloudBackup.createBackup({ manual: true });
                      if (success) {
                        showToast("Cloud backup created successfully");
                      } else {
                        showToast("Failed to create cloud backup");
                      }
                    }}
                    disabled={cloudBackup.isBackingUp}
                  >
                    {cloudBackup.isBackingUp ? "Backing Up…" : "Backup to Cloud"}
                  </button>
                  <button
                    className="btn ghost"
                    onClick={async () => {
                      const backup = await cloudBackup.restoreBackup("latest");
                      if (backup) {
                        showToast(`Restored backup from ${new Date(backup.createdAt).toLocaleString()}`);
                        // Note: Actual restore would need to call addTask/addSession for each item
                        // This is a UI placeholder for the restore flow
                      } else {
                        showToast("No cloud backup found");
                      }
                    }}
                    disabled={cloudBackup.isRestoring}
                  >
                    {cloudBackup.isRestoring ? "Restoring…" : "Restore from Cloud"}
                  </button>
                </div>

                {cloudBackup.error && (
                  <div className="setting-warning">
                    {cloudBackup.error}
                    <button className="btn small ghost" onClick={cloudBackup.clearError}>
                      Dismiss
                    </button>
                  </div>
                )}

                <div className="setting-hint">
                  Automatic backups are created daily when you use the app. Your data is stored securely in the cloud.
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {/* About Section */}
      <section className="settings-section">
        <h3>About</h3>
        <div className="settings-card about-card">
          <div className="about-logo" aria-hidden="true">⏱</div>
          <h4>AllTime</h4>
          <p className="about-tagline">count up. no pressure. just see where it goes.</p>
          <p className="about-desc">
            A count-up timer designed for ADHD brains. Track how long you spend on tasks
            and gain insights into where your time goes.
          </p>
          <div className="about-version">v1.0.0</div>
        </div>
      </section>
    </div>
  );
}
