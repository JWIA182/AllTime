import { useMemo } from "react";
import { colorForTask } from "../lib/colors";
import { exportCSV, formatTotal } from "../lib/formatters";
import {
  addSession,
  clearSessions,
  removeSession as removeSessionRemote,
} from "../lib/sessions";
import { addTask, deleteTask } from "../lib/tasks";

export default function TasksTab({ user, tasks, sessions, showToast, onNew, onExportJSON, onImportJSON }) {
  const handleDelete = async (task) => {
    try {
      await deleteTask(user.id, task.id);
      showToast(`"${task.name}" deleted`, async () => {
        try {
          await addTask(user.id, { name: task.name, color: task.color });
        } catch {}
      });
    } catch (err) {
      console.error("[tasks] delete error:", err);
    }
  };

  const handleRemoveSession = async (s) => {
    try {
      await removeSessionRemote(user.id, s.id);
      showToast("Session removed", async () => {
        try {
          await addSession(user.id, {
            taskId: s.taskId,
            task: s.task,
            ms: s.ms,
            endedAt: s.endedAt,
          });
        } catch {}
      });
    } catch (err) {
      console.error("[sessions] remove error:", err);
    }
  };

  const handleClearAll = async () => {
    try {
      await clearSessions(user.id);
      showToast("All sessions cleared");
    } catch (err) {
      console.error("[sessions] clear error:", err);
    }
  };

  const totals = useMemo(() => {
    const m = {};
    sessions.forEach((s) => {
      const key = s.taskId || s.task;
      m[key] = (m[key] || 0) + s.ms;
    });
    return m;
  }, [sessions]);

  return (
    <div className="tasks-tab">
      <div className="tasks-header">
        <h2 className="tab-title">Tasks</h2>
        <div className="tasks-header-actions">
          {sessions.length > 0 && (
            <>
              <button
                className="btn small"
                onClick={() => exportCSV(sessions, tasks)}
                aria-label="Export sessions as CSV"
              >
                Export CSV
              </button>
              <button
                className="btn small"
                onClick={onExportJSON}
                aria-label="Export all data as JSON backup"
              >
                Backup JSON
              </button>
            </>
          )}
          <button
            className="btn small"
            onClick={onImportJSON}
            aria-label="Import data from JSON backup"
          >
            Import
          </button>
          <button className="btn primary small" onClick={onNew}>
            + New Task
          </button>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="empty">
          <p>no tasks yet — create one to get started</p>
        </div>
      ) : (
        <ul className="task-manage-list" role="list" aria-label="Manage tasks">
          {tasks.map((task) => (
            <li key={task.id} className="tm-card">
              <div className="tm-left">
                <span className="dot lg" style={{ background: task.color }} aria-hidden="true" />
                <div className="tm-info">
                  <div className="tm-name">{task.name}</div>
                  <div className="tm-total">
                    {totals[task.id]
                      ? `Total: ${formatTotal(totals[task.id])}`
                      : "No sessions yet"}
                  </div>
                </div>
              </div>
              <div className="tm-actions">
                <button
                  className="icon-btn small danger"
                  onClick={() => handleDelete(task)}
                  aria-label={`Delete ${task.name}`}
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {sessions.length > 0 && (
        <div className="session-history">
          <div className="section-head">
            <h3>Recent Sessions</h3>
            <button className="linkish" onClick={handleClearAll}>
              clear all
            </button>
          </div>
          <ul className="session-list" role="list" aria-label="Recent sessions">
            {sessions.slice(0, 50).map((s) => (
              <li key={s.id} className="session-item">
                <div className="si-main">
                  <span
                    className="dot"
                    style={{
                      background:
                        s.taskId && tasks.find((t) => t.id === s.taskId)
                          ? tasks.find((t) => t.id === s.taskId).color
                          : colorForTask(s.task),
                    }}
                    aria-hidden="true"
                  />
                  <span className="si-task">{s.task}</span>
                  <span className="si-time">{formatTotal(s.ms)}</span>
                </div>
                <div className="si-sub">
                  {new Date(s.endedAt).toLocaleString()}
                  <button
                    className="linkish"
                    onClick={() => handleRemoveSession(s)}
                    aria-label={`Remove session: ${s.task}`}
                  >
                    remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
