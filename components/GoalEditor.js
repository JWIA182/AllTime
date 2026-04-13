import { useEffect, useState } from "react";
import { addGoal, deleteGoal, updateGoal } from "../lib/goals";
import { haptic } from "../lib/formatters";

export default function GoalEditor({ user, tasks, goals, showToast, onClose }) {
  const [taskId, setTaskId] = useState(tasks[0]?.id || "");
  const [targetMinutes, setTargetMinutes] = useState(60);
  const [period, setPeriod] = useState("daily");
  const [editingGoal, setEditingGoal] = useState(null);

  useEffect(() => {
    if (goals.length > 0 && !editingGoal) {
      setEditingGoal(goals[0]);
      setTaskId(goals[0].taskId || "");
      setTargetMinutes(goals[0].targetMinutes);
      setPeriod(goals[0].period || "daily");
    }
  }, [goals, editingGoal]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!taskId || targetMinutes < 1) return;

    const task = tasks.find((t) => t.id === taskId);
    const goalData = {
      taskId,
      taskName: task?.name || "Untitled",
      targetMinutes: Number(targetMinutes),
      period,
    };

    try {
      if (editingGoal) {
        await updateGoal(user.id, editingGoal.id, goalData);
        showToast("Goal updated", () => haptic("success"));
      } else {
        await addGoal(user.id, goalData);
        showToast("Goal created", () => haptic("success"));
      }
      onClose();
    } catch (err) {
      console.error("[goals] save error:", err);
      showToast("Failed to save goal", () => haptic("error"));
    }
  };

  const handleDelete = async () => {
    if (!editingGoal) return;
    try {
      await deleteGoal(user.id, editingGoal.id);
      showToast("Goal deleted", () => haptic("double"));
      onClose();
    } catch (err) {
      console.error("[goals] delete error:", err);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Edit goals">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3>Daily Goals</h3>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>
              Task
            </label>
            <select
              className="auth-input"
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              style={{ textTransform: "uppercase" }}
            >
              <option value="">All tasks</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>
              Target (minutes)
            </label>
            <input
              type="number"
              className="auth-input"
              value={targetMinutes}
              onChange={(e) => setTargetMinutes(e.target.value)}
              min="1"
              max="1440"
              style={{ textTransform: "none" }}
            />
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>
              Period
            </label>
            <div className="seg">
              <button
                type="button"
                className={`seg-btn ${period === "daily" ? "active" : ""}`}
                onClick={() => setPeriod("daily")}
              >
                Daily
              </button>
              <button
                type="button"
                className={`seg-btn ${period === "weekly" ? "active" : ""}`}
                onClick={() => setPeriod("weekly")}
              >
                Weekly
              </button>
            </div>
          </div>

          <div className="modal-actions">
            {editingGoal && (
              <button
                type="button"
                className="btn danger small"
                onClick={handleDelete}
              >
                Delete
              </button>
            )}
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary">
              {editingGoal ? "Update" : "Create"}
            </button>
          </div>
        </form>

        {goals.length > 0 && (
          <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--line-light)" }}>
            <p style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
              Active Goals ({goals.length})
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {goals.map((goal) => (
                <button
                  key={goal.id}
                  className="btn small"
                  style={{
                    textAlign: "left",
                    justifyContent: "space-between",
                    display: "flex",
                  }}
                  onClick={() => {
                    setEditingGoal(goal);
                    setTaskId(goal.taskId || "");
                    setTargetMinutes(goal.targetMinutes);
                    setPeriod(goal.period || "daily");
                  }}
                >
                  <span>{goal.taskName || "All Tasks"}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>
                    {goal.targetMinutes}m/{goal.period}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
