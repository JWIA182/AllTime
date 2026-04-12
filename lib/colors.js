/*
 * Color palette for task assignment. Users pick from this list when
 * creating or editing a task. Colors are muted/earthy to match the
 * warm dark theme.
 */

export const taskColorPalette = [
  "#6b9e78", // sage
  "#5b8fb9", // ocean
  "#8b7bb5", // lavender
  "#c47a6a", // coral
  "#c4956a", // amber
  "#5ba89e", // teal
  "#b57b9e", // rose
  "#b5a46b", // sand
  "#7b9eb5", // steel
  "#a8856b", // walnut
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
  if (!key) return taskColorPalette[0];
  return taskColorPalette[hash(key) % taskColorPalette.length];
}

export function colorForUser(user) {
  if (!user) return taskColorPalette[0];
  const key = user.id || user.email || "";
  return taskColorPalette[hash(key) % taskColorPalette.length];
}
