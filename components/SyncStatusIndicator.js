import { firebaseEnabled } from "../lib/firebase";

/*
 * SyncStatusIndicator - Visual indicator showing sync state
 */

export default function SyncStatusIndicator({ syncStatus }) {
  if (!firebaseEnabled) {
    return (
      <div className="sync-status local" title="Local mode - data stored in browser only" aria-label="Local mode">
        <span className="sync-icon" aria-hidden="true">○</span>
        <span className="sync-label">Local</span>
      </div>
    );
  }

  const { status, label, icon } = syncStatus;

  return (
    <div className={`sync-status ${status}`} title={`Sync status: ${label}`} aria-label={`Sync status: ${label}`}>
      <span className="sync-icon" aria-hidden="true">{icon}</span>
      <span className="sync-label">{label}</span>
    </div>
  );
}
