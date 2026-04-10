import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNow, format, isToday, isYesterday } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── JSON array helpers (SQLite stores arrays as JSON strings) ────────────────

export function parseJsonArray<T = string>(value: string | null | undefined): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function stringifyArray(arr: unknown[]): string {
  return JSON.stringify(arr);
}

// ─── Date formatting ──────────────────────────────────────────────────────────

export function formatEmailDate(date: Date): string {
  if (isToday(date)) return format(date, "h:mm a");
  if (isYesterday(date)) return "Yesterday";
  return format(date, "MMM d");
}

export function formatRelativeDate(date: Date): string {
  return formatDistanceToNow(date, { addSuffix: true });
}

export function formatFullDate(date: Date): string {
  return format(date, "PPpp");
}

// ─── Email helpers ────────────────────────────────────────────────────────────

export function extractEmailAddress(from: string): string {
  const match = from.match(/<(.+?)>/);
  return match ? match[1] : from;
}

export function extractDisplayName(from: string): string {
  const match = from.match(/^(.+?)\s*</);
  return match ? match[1].trim().replace(/^"(.*)"$/, "$1") : from;
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + "…";
}

// ─── Confidence display ───────────────────────────────────────────────────────

export function confidenceLabel(score: number): string {
  if (score >= 0.85) return "High confidence";
  if (score >= 0.65) return "Medium confidence";
  return "Low confidence";
}

export function confidenceColor(score: number): string {
  if (score >= 0.85) return "text-emerald-600";
  if (score >= 0.65) return "text-amber-600";
  return "text-red-500";
}

// ─── Priority badge styling ───────────────────────────────────────────────────

export function priorityBadgeClass(priority: string): string {
  switch (priority) {
    case "high":
      return "bg-red-100 text-red-800 border-red-200";
    case "low":
      return "bg-slate-100 text-slate-600 border-slate-200";
    default:
      return "bg-blue-100 text-blue-800 border-blue-200";
  }
}
