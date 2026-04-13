import { useState } from "react";
import { formatTime, formatTotal, haptic } from "../lib/formatters";

export default function TimerTab({
  tasks,
  activeTask,
  timer,
  todayTotal,
  taskTodayMs,
  streak,
  brainDump,
  showToast,
  onEditTask,
  onNewTask,
}) {
  const [dumpInput, setDumpInput] = useState("");

  const handleDumpSubmit = (e) => {
    e.preventDefault();
    if (!dumpInput.trim()) return;
    brainDump.add(dumpInput);
    setDumpInput("");
  };

  const handleDumpRemove = (id) => {
    const removed = brainDump.remove(id);
    showToast("Thought dismissed", () => brainDump.restore(removed));
  };

  return (
    <div className="timer-tab">
      {/* now tracking banner */}
      {activeTask && (
        <div
          className="now-tracking"
          style={{ borderLeftColor: activeTask.color }}
          role="status"
          aria-live="polite"
          aria-label={`Now tracking ${activeTask.name}`}
        >
          <div className="nt-left">
            <div className="nt-label">NOW TRACKING</div>
            <div className="nt-task">
              <span
                className="dot"
                style={{ background: activeTask.color }}
                aria-hidden="true"
              />
              {activeTask.name}
            </div>
          </div>
          <div className="nt-right">
            <div className="nt-timer" aria-label={`Elapsed time: ${formatTime(timer.elapsed)}`}>
              {formatTime(timer.elapsed)}
            </div>
            <div className="nt-controls">
              {timer.running ? (
                <button
                  className="ctrl-btn"
                  onClick={() => { haptic("short"); timer.pause(); }}
                  aria-label="Pause timer"
                >
                  ❚❚
                </button>
              ) : (
                <button
                  className="ctrl-btn"
                  onClick={() => { haptic("medium"); timer.resume(); }}
                  aria-label="Resume timer"
                >
                  ▶
                </button>
              )}
              <button
                className="ctrl-btn stop"
                onClick={() => { haptic("double"); timer.stopAndSave(); }}
                aria-label="Stop timer and save session"
              >
                ■
              </button>
            </div>
          </div>
        </div>
      )}

      {/* brain dump input */}
      {timer.activeTaskId && (
        <form className="brain-dump-input" onSubmit={handleDumpSubmit}>
          <input
            type="text"
            placeholder="park a thought… (press enter)"
            aria-label="Park a thought"
            value={dumpInput}
            onChange={(e) => setDumpInput(e.target.value)}
            className="auth-input bd-input"
          />
        </form>
      )}

      {/* today stat + streak */}
      <div className="today-row" role="status" aria-label={`Today total: ${formatTotal(todayTotal)}`}>
        <div className="today-stat">
          today <strong>{formatTotal(todayTotal)}</strong>
        </div>
        {streak > 0 && (
          <div className="streak" aria-label={`${streak}-day streak`}>
            <span className="streak-icon" aria-hidden="true">🔥</span>
            {streak}-day streak
          </div>
        )}
      </div>

      {/* task list */}
      <div className="section-head">
        <h2>YOUR TASKS</h2>
      </div>

      {tasks.length === 0 ? (
        <div className="empty">
          <p>no tasks yet</p>
          <button className="btn primary" onClick={onNewTask}>
            create your first task
          </button>
        </div>
      ) : (
        <ul className="task-list" role="list" aria-label="Your tasks">
          {tasks.map((task, i) => {
            const isActive = task.id === timer.activeTaskId;
            const todayMs =
              (taskTodayMs[task.id] || 0) + (isActive ? timer.elapsed : 0);
            return (
              <li
                key={task.id}
                className={`task-card ${isActive ? "active" : ""}`}
              >
                <div
                  className="tc-left"
                  onClick={() => onEditTask(task)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Edit task ${task.name}`}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEditTask(task); } }}
                >
                  <span className="dot" style={{ background: task.color }} aria-hidden="true" />
                  <div className="tc-info">
                    <div className="tc-name">{task.name}</div>
                    <div className="tc-sub">
                      {isActive && timer.running ? (
                        <span className="running-badge">Running</span>
                      ) : todayMs > 0 ? (
                        `Today · ${formatTotal(todayMs)}`
                      ) : (
                        "No time today"
                      )}
                    </div>
                  </div>
                </div>
                <div className="tc-right">
                  <span className="tc-num" aria-hidden="true">{i + 1}</span>
                  <span className="tc-time">
                    {isActive ? formatTime(timer.elapsed) : formatTotal(todayMs)}
                  </span>
                  {isActive && timer.running ? (
                    <button
                      className="play-btn"
                      onClick={() => { haptic("short"); timer.pause(); }}
                      aria-label={`Pause ${task.name}`}
                    >
                      ❚❚
                    </button>
                  ) : (
                    <button
                      className="play-btn"
                      onClick={() => {
                        haptic(isActive ? "medium" : "success");
                        isActive && !timer.running
                          ? timer.resume()
                          : timer.startTask(task.id);
                      }}
                      aria-label={`Start ${task.name}`}
                    >
                      ▶
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* brain dump list */}
      {brainDump.items.length > 0 && (
        <div className="brain-dump-section">
          <div className="section-head">
            <h2>PARKED THOUGHTS</h2>
            <button
              className="linkish"
              onClick={() => {
                brainDump.clear();
                showToast("All thoughts cleared");
              }}
            >
              clear all
            </button>
          </div>
          <ul className="brain-dump-list" role="list" aria-label="Parked thoughts">
            {brainDump.items.map((item) => (
              <li key={item.id} className="bd-item">
                <span className="bd-text">{item.text}</span>
                <button
                  className="bd-dismiss"
                  onClick={() => handleDumpRemove(item.id)}
                  aria-label={`Dismiss: ${item.text}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
