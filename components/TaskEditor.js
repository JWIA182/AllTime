import { useEffect, useRef, useState } from "react";
import { taskColorPalette } from "../lib/colors";
import { addTask, updateTask } from "../lib/tasks";
import { CATEGORIES, getCategoryById } from "../lib/categories";

export default function TaskEditor({ user, task, onClose }) {
  const [name, setName] = useState(task?.name || "");
  const [color, setColor] = useState(task?.color || taskColorPalette[0]);
  const [category, setCategory] = useState(task?.category || "other");
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
        await updateTask(user.id, task.id, { name: trimmed, color, category });
      } else {
        await addTask(user.id, { name: trimmed, color, category });
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
          style={{ textTransform: "none" }}
        />
        
        {/* Category selector */}
        <div style={{ marginTop: "12px" }}>
          <label style={{ display: "block", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>
            Category
          </label>
          <div className="color-picker" role="radiogroup" aria-label="Task category">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                className={`color-swatch ${category === cat.id ? "active" : ""}`}
                style={{ 
                  background: cat.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "16px",
                }}
                onClick={() => setCategory(cat.id)}
                role="radio"
                aria-checked={category === cat.id}
                aria-label={cat.name}
                title={cat.name}
              >
                {cat.icon}
              </button>
            ))}
          </div>
        </div>

        <div className="color-picker" role="radiogroup" aria-label="Task color" style={{ marginTop: "12px" }}>
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
