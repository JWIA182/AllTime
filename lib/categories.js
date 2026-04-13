/*
 * Task Categories - Predefined categories for organizing tasks
 */

export const CATEGORIES = [
  { id: "work", name: "Work", icon: "💼", color: "#3b82f6" },
  { id: "personal", name: "Personal", icon: "🏠", color: "#10b981" },
  { id: "health", name: "Health", icon: "💪", color: "#ef4444" },
  { id: "learning", name: "Learning", icon: "📚", color: "#f59e0b" },
  { id: "creative", name: "Creative", icon: "🎨", color: "#8b5cf6" },
  { id: "social", name: "Social", icon: "👥", color: "#ec4899" },
  { id: "chores", name: "Chores", icon: "🧹", color: "#6b7280" },
  { id: "other", name: "Other", icon: "📌", color: "#64748b" },
];

export function getCategoryById(id) {
  return CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
}

export function getCategoryColor(id) {
  return getCategoryById(id).color;
}
