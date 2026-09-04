/**
 * Format amount as Indian Rupees (INR) with Indian comma grouping.
 * e.g. 48200 -> "₹48,200"
 */
export function formatINR(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) return '₹0';
  return '₹' + Math.round(amount).toLocaleString('en-IN');
}

/**
 * Format hours into a human-readable string.
 * < 1 hour -> "45 min", >= 1 hour -> "3.4h"
 */
export function formatHours(hours: number): string {
  if (hours === null || hours === undefined || isNaN(hours)) return '0h';
  if (hours < 1) {
    const mins = Math.max(1, Math.round(hours * 60));
    return `${mins} min`;
  }
  return `${hours.toFixed(1)}h`;
}

/**
 * Format ISO string to wall clock time (HH:MM).
 */
export function formatWallClock(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr.substring(11, 16) || isoStr;
    return d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return isoStr;
  }
}

/**
 * Format full date and time for timestamps.
 */
export function formatDateTime(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return isoStr;
  }
}

/**
 * Shorten UUID to 8 characters for clean badges.
 */
export function shortId(id: string): string {
  if (!id) return '';
  return id.length > 8 ? id.substring(0, 8).toUpperCase() : id.toUpperCase();
}

/**
 * Returns color classes based on confidence level.
 */
export function getConfidenceBadgeColor(level: 'LOW' | 'MEDIUM' | 'HIGH'): {
  bg: string;
  text: string;
  border: string;
  dot: string;
} {
  switch (level) {
    case 'HIGH':
      return {
        bg: 'bg-emerald-950/60',
        text: 'text-emerald-400',
        border: 'border-emerald-700/50',
        dot: 'bg-emerald-500',
      };
    case 'MEDIUM':
      return {
        bg: 'bg-amber-950/60',
        text: 'text-amber-400',
        border: 'border-amber-700/50',
        dot: 'bg-amber-500',
      };
    case 'LOW':
    default:
      return {
        bg: 'bg-rose-950/60',
        text: 'text-rose-400',
        border: 'border-rose-700/50',
        dot: 'bg-rose-500',
      };
  }
}
