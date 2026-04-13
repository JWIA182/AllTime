import { useMemo, useState } from "react";
import { colorForTask } from "../lib/colors";
import {
  addDays,
  DAY_NAMES,
  formatTotal,
  MONTH_NAMES,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "../lib/formatters";

/* ===== SVG charts ===== */

function BarChart({ data, maxHours }) {
  const W = 400;
  const H = 180;
  const PAD_T = 10;
  const PAD_B = 24;
  const PAD_X = 4;
  const chartH = H - PAD_T - PAD_B;
  const colW = (W - PAD_X * 2) / data.length;
  const barW = colW * 0.55;
  const scale = chartH / (maxHours || 1);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      className="chart-bar"
      role="img"
      aria-label="Bar chart showing hours per time period"
    >
      {data.map((day, i) => {
        const x = PAD_X + i * colW + (colW - barW) / 2;
        let y = H - PAD_B;
        return (
          <g key={i}>
            {day.segments.map((seg, j) => {
              const h = Math.max(0, seg.hours * scale);
              y -= h;
              return (
                <rect
                  key={j}
                  x={x}
                  y={y}
                  width={barW}
                  height={h}
                  fill={seg.color}
                  rx={3}
                />
              );
            })}
            <text
              x={PAD_X + i * colW + colW / 2}
              y={H - 4}
              textAnchor="middle"
              className="chart-label"
            >
              {day.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function DonutChart({ segments }) {
  const R = 70;
  const CX = 100;
  const CY = 100;
  const SW = 26;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <svg
      viewBox="0 0 200 200"
      preserveAspectRatio="xMidYMid meet"
      className="chart-donut"
      role="img"
      aria-label="Donut chart showing time distribution by task"
    >
      <g transform={`rotate(-90 ${CX} ${CY})`}>
        {segments.map((seg, i) => {
          const dash = (seg.pct / 100) * C;
          const gap = segments.length > 1 ? 3 : 0;
          const el = (
            <circle
              key={i}
              cx={CX}
              cy={CY}
              r={R}
              fill="none"
              stroke={seg.color}
              strokeWidth={SW}
              strokeDasharray={`${Math.max(0, dash - gap)} ${C - dash + gap}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
            />
          );
          offset += dash;
          return el;
        })}
      </g>
    </svg>
  );
}

/* TrendLineChart - Shows productivity trends over time */
function TrendLineChart({ data }) {
  if (!data || data.length === 0) return null;
  
  const W = 400;
  const H = 150;
  const PAD_T = 20;
  const PAD_B = 30;
  const PAD_X = 40;
  const chartW = W - PAD_X * 2;
  const chartH = H - PAD_T - PAD_B;
  
  const maxVal = Math.max(...data.map(d => d.hours), 1);
  const points = data.map((d, i) => {
    const x = PAD_X + (i / (data.length - 1 || 1)) * chartW;
    const y = PAD_T + chartH - (d.hours / maxVal) * chartH;
    return { x, y, ...d };
  });
  
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = pathD + ` L ${points[points.length - 1].x} ${PAD_T + chartH} L ${points[0].x} ${PAD_T + chartH} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      className="chart-line"
      role="img"
      aria-label="Line chart showing productivity trends"
    >
      <defs>
        <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      
      {/* Area fill */}
      <path d={areaD} fill="url(#trendGradient)" />
      
      {/* Line */}
      <path d={pathD} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      
      {/* Points */}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3" fill="var(--accent)" />
          <text
            x={p.x}
            y={H - 8}
            textAnchor="middle"
            className="chart-label"
            fontSize="10"
          >
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ===== InsightsTab ===== */

export default function InsightsTab({ tasks, sessions }) {
  const [period, setPeriod] = useState("week");

  const tasksMap = useMemo(() => {
    const m = {};
    tasks.forEach((t) => (m[t.id] = t));
    return m;
  }, [tasks]);

  function getTaskColor(s) {
    if (s.taskId && tasksMap[s.taskId]) return tasksMap[s.taskId].color;
    return colorForTask(s.task);
  }
  function getTaskName(s) {
    if (s.taskId && tasksMap[s.taskId]) return tasksMap[s.taskId].name;
    return s.task;
  }

  // Memoize 'now' to prevent unnecessary recalculations
  const now = useMemo(() => new Date(), []);
  
  const periodStart = useMemo(() => {
    if (period === "day") return startOfDay(now);
    if (period === "week") return startOfWeek(now);
    if (period === "month") return startOfMonth(now);
    return startOfYear(now);
  }, [period, now]);

  const filtered = useMemo(
    () => sessions.filter((s) => new Date(s.endedAt) >= periodStart),
    [sessions, periodStart]
  );

  const totalMs = useMemo(
    () => filtered.reduce((a, s) => a + s.ms, 0),
    [filtered]
  );
  const sessionCount = filtered.length;

  // Productivity Score (0-100)
  const productivityScore = useMemo(() => {
    if (sessionCount === 0) return 0;
    
    const totalHours = totalMs / 3600000;
    const avgSessionLength = totalHours / sessionCount;
    
    // Score based on:
    // - Total time (40%): Up to 8 hours = 40 points
    // - Session count (30%): 4-8 sessions = 30 points
    // - Consistency (30%): Regular sessions across days
    const timeScore = Math.min(40, (totalHours / 8) * 40);
    const sessionScore = Math.min(30, (sessionCount / 8) * 30);
    
    // Calculate consistency: how many different days have sessions
    const uniqueDays = new Set(filtered.map(s => startOfDay(new Date(s.endedAt)).toISOString())).size;
    const expectedDays = period === "day" ? 1 : period === "week" ? 7 : period === "month" ? 30 : 365;
    const consistencyScore = Math.min(30, (uniqueDays / Math.min(expectedDays, sessionCount)) * 30);
    
    return Math.round(timeScore + sessionScore + consistencyScore);
  }, [totalMs, sessionCount, filtered, period]);

  // Average Session Duration
  const avgSessionDuration = useMemo(() => {
    if (sessionCount === 0) return 0;
    return totalMs / sessionCount;
  }, [totalMs, sessionCount]);

  // Most Productive Hours
  const productiveHours = useMemo(() => {
    const hours = {};
    filtered.forEach((s) => {
      const hour = new Date(s.endedAt).getHours();
      hours[hour] = (hours[hour] || 0) + s.ms;
    });
    
    return Object.entries(hours)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([hour]) => {
        const h = parseInt(hour);
        return h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`;
      });
  }, [filtered]);

  // Weekly Trends (last 8 weeks)
  const weeklyTrends = useMemo(() => {
    if (period !== "week" && period !== "month") return [];
    
    const weeks = [];
    for (let i = 7; i >= 0; i--) {
      const weekStart = startOfWeek(addDays(now, -i * 7));
      const weekEnd = addDays(weekStart, 7);
      
      const weekSessions = sessions.filter(s => {
        const d = new Date(s.endedAt);
        return d >= weekStart && d < weekEnd;
      });
      
      const totalWeekMs = weekSessions.reduce((a, s) => a + s.ms, 0);
      weeks.push({
        label: `W${8 - i}`,
        hours: totalWeekMs / 3600000,
        sessions: weekSessions.length,
      });
    }
    
    return weeks;
  }, [sessions, period, now]);

  const bestDay = useMemo(() => {
    const days = {};
    filtered.forEach((s) => {
      const key = startOfDay(new Date(s.endedAt)).toISOString();
      days[key] = (days[key] || 0) + s.ms;
    });
    let best = null;
    let bestMs = 0;
    Object.entries(days).forEach(([key, ms]) => {
      if (ms > bestMs) {
        bestMs = ms;
        best = new Date(key);
      }
    });
    return best
      ? {
          label: best.toLocaleDateString("en-US", { weekday: "long" }),
          ms: bestMs,
        }
      : null;
  }, [filtered]);

  const barData = useMemo(() => {
    if (period === "day") return [];
    const buckets = [];
    if (period === "week") {
      const ws = startOfWeek(now);
      for (let i = 0; i < 7; i++) {
        buckets.push({ start: addDays(ws, i), label: DAY_NAMES[i] });
      }
    } else if (period === "month") {
      const ms = startOfMonth(now);
      for (let w = 0; w < 5; w++) {
        const s = addDays(ms, w * 7);
        if (s.getMonth() !== now.getMonth() && w > 0) break;
        buckets.push({ start: s, label: `W${w + 1}` });
      }
    } else {
      for (let m = 0; m < 12; m++) {
        buckets.push({
          start: new Date(now.getFullYear(), m, 1),
          label: MONTH_NAMES[m],
        });
      }
    }

    return buckets.map((b, i) => {
      const end = buckets[i + 1]?.start || new Date(9999, 0);
      const inBucket = filtered.filter((s) => {
        const d = new Date(s.endedAt);
        return d >= b.start && d < end;
      });
      const byTask = {};
      inBucket.forEach((s) => {
        const name = getTaskName(s);
        if (!byTask[name]) byTask[name] = { hours: 0, color: getTaskColor(s) };
        byTask[name].hours += s.ms / 3600000;
      });
      return { label: b.label, segments: Object.values(byTask) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, period, tasks]);

  const maxBarHours = useMemo(
    () =>
      Math.max(
        1,
        ...barData.map((d) => d.segments.reduce((a, s) => a + s.hours, 0))
      ),
    [barData]
  );

  const donutData = useMemo(() => {
    const byTask = {};
    filtered.forEach((s) => {
      const name = getTaskName(s);
      if (!byTask[name])
        byTask[name] = { ms: 0, color: getTaskColor(s), name };
      byTask[name].ms += s.ms;
    });
    const sorted = Object.values(byTask).sort((a, b) => b.ms - a.ms);
    const total = sorted.reduce((a, s) => a + s.ms, 0) || 1;
    return sorted.map((s) => ({ ...s, pct: (s.ms / total) * 100 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, tasks]);

  return (
    <div className="insights-tab">
      <h2 className="tab-title">Insights</h2>

      <div className="period-tabs" role="tablist" aria-label="Time period">
        {["day", "week", "month", "year"].map((p) => (
          <button
            key={p}
            role="tab"
            aria-selected={period === p}
            className={`period-btn ${period === p ? "active" : ""}`}
            onClick={() => setPeriod(p)}
          >
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      <div className="stats-row" role="region" aria-label="Statistics">
        <div className="stat-card">
          <div className="stat-value">{formatTotal(totalMs)}</div>
          <div className="stat-label">
            Total {period === "day" ? "today" : `this ${period}`}
          </div>
        </div>
        {bestDay && (
          <div className="stat-card">
            <div className="stat-value">{formatTotal(bestDay.ms)}</div>
            <div className="stat-label">Best Day</div>
            <div className="stat-sub">{bestDay.label}</div>
          </div>
        )}
        <div className="stat-card">
          <div className="stat-value">{sessionCount}</div>
          <div className="stat-label">Sessions</div>
        </div>
      </div>

      {/* Enhanced Stats */}
      <div className="stats-row enhanced-stats" role="region" aria-label="Advanced Statistics">
        <div className="stat-card">
          <div className="stat-value score-value" style={{ color: productivityScore >= 70 ? "var(--accent)" : productivityScore >= 40 ? "#ffc107" : "#ff5722" }}>
            {productivityScore}
          </div>
          <div className="stat-label">Productivity Score</div>
          <div className="stat-sub">out of 100</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{formatTotal(avgSessionDuration)}</div>
          <div className="stat-label">Avg Session</div>
        </div>
        {productiveHours.length > 0 && (
          <div className="stat-card">
            <div className="stat-value stat-list">{productiveHours.join(", ")}</div>
            <div className="stat-label">Peak Hours</div>
          </div>
        )}
      </div>

      {/* Weekly Trends Chart */}
      {weeklyTrends.length > 0 && (
        <div className="chart-section">
          <h3 className="chart-title">Weekly Trends (Last 8 Weeks)</h3>
          <div className="chart-responsive">
            <TrendLineChart data={weeklyTrends} />
          </div>
        </div>
      )}

      {barData.length > 0 && (
        <div className="chart-section">
          <h3 className="chart-title">
            {period === "year" ? "Hours per month" : "Hours per day"}
          </h3>
          <div className="chart-responsive">
            <BarChart data={barData} maxHours={maxBarHours} />
          </div>
        </div>
      )}

      {donutData.length > 0 && (
        <div className="chart-section donut-section">
          <div className="donut-wrap">
            <DonutChart segments={donutData} />
          </div>
          <ul className="donut-legend" aria-label="Task time breakdown">
            {donutData.map((d) => (
              <li key={d.name}>
                <span className="dot" style={{ background: d.color }} aria-hidden="true" />
                <span className="dl-name">{d.name}</span>
                <span className="dl-pct">{Math.round(d.pct)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="empty">
          <p>
            no sessions logged{" "}
            {period === "day" ? "today" : `this ${period}`}
          </p>
        </div>
      )}
    </div>
  );
}
