/*
 * Deterministic per-task pastel colors. The same task name always maps to
 * the same color, so "reading" looks the same across the totals list and
 * the sessions list — useful for ADHD pattern recognition.
 *
 * Palette is intentionally muted so it doesn't fight the minimalist theme.
 */

const palette = [
  "#ffd5cd", // coral
  "#ffe2b8", // peach
  "#fff2b0", // butter
  "#dcecc1", // sage
  "#bfe3d4", // mint
  "#c5dcec", // sky
  "#d4cdec", // lavender
  "#ecc8dc", // rose
  "#e8d5c4", // sand
  "#cfd8e0", // stone
];

function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function colorForTask(task) {
  const key = (task || "").toLowerCase().trim();
  if (!key) return palette[0];
  return palette[hash(key) % palette.length];
}

export function colorForUser(user) {
  if (!user) return palette[0];
  const key = user.id || user.email || "";
  return palette[hash(key) % palette.length];
}
