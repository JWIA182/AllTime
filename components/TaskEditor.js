import { useEffect, useRef, useState } from "react";
import { taskColorPalette } from "../lib/colors";
import { addTask, updateTask } from "../lib/tasks";

export default function TaskEditor({ user, task, onClose }) {
  const [name, setName] = useState(task?.name || "");
  const [color, setColor] = useState(task?.color || taskColorPalette[0]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      if (task) {
        await updateTask(user.id, task.id, { name: trimmed, color });
      } else {
        await addTask(user.id, { name: trimmed, color });
      }
      onClose();
    } catch (err) {
      console.error("[task editor] error:", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={task ? "Edit task" : "New task"}
    >
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3>{task ? "Edit Task" : "New Task"}</h3>
        <input
          ref={inputRef}
          className="auth-input"
          type="text"
          placeholder="Task name"
          aria-label="Task name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        <div className="color-picker" role="radiogroup" aria-label="Task color">
          {taskColorPalette.map((c) => (
            <button
              key={c}
              className={`color-swatch ${color === c ? "active" : ""}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              role="radio"
              aria-checked={color === c}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>
            cancel
          </button>
          <button
            className="btn primary"
            onClick={save}
            disabled={!name.trim() || busy}
          >
            {busy ? "…" : task ? "save" : "create"}
          </button>
        </div>
      </div>
    </div>
  );
}
