// ── Utility ──────────────────────────────────────────────────────────────────

export function formatRelativeTime(value: Date | string | number) {
  const date = value instanceof Date ? value : new Date(value);
  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (diffInMinutes < 60) return `${Math.max(1, diffInMinutes)} 分`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours} 小时`;
  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays} 天`;
}
