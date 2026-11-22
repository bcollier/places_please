import type { PracticeSession } from '@/lib/types';

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Consecutive days (ending today or yesterday) with at least one practice session. */
export function practiceStreak(sessions: PracticeSession[], now = new Date()): number {
  const days = new Set(sessions.map((s) => dayKey(new Date(s.started_at))));
  const cursor = new Date(now);
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function sessionsThisWeek(sessions: PracticeSession[], now = new Date()): number {
  const weekAgo = now.getTime() - 7 * 24 * 3600 * 1000;
  return sessions.filter((s) => new Date(s.started_at).getTime() >= weekAgo).length;
}

export function lastScore(sessions: PracticeSession[]): number | null {
  const s = sessions.find((x) => x.mode !== 'listen' && x.score !== null);
  return s?.score ?? null;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function formatRelativeDay(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const today = dayKey(now);
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (dayKey(d) === today) return `Today, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  if (dayKey(d) === dayKey(y)) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
