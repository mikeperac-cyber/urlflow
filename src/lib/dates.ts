const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const dateYearFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const fullFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export type Tone = 'overdue' | 'today' | 'soon' | 'later' | 'none';

export function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function startOfDay(date: Date = new Date()): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

export function formatDate(value?: string | null): string {
  const date = parseDate(value);
  if (!date) return '';
  return date.getFullYear() === new Date().getFullYear() ? dateFmt.format(date) : dateYearFmt.format(date);
}

export function formatFull(value?: string | null): string {
  const date = parseDate(value);
  return date ? fullFmt.format(date) : '';
}

export function formatClock(value?: string | null): string {
  const date = parseDate(value);
  return date ? timeFmt.format(date) : '';
}

export function calendarLabel(value?: string | null): string {
  const date = parseDate(value);
  if (!date) return '';
  const today = startOfDay();
  const target = startOfDay(date);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) return weekdayFmt.format(date);
  return formatDate(value);
}

export function dueInfo(value?: string | null): { label: string; tone: Tone } {
  const date = parseDate(value);
  if (!date) return { label: 'No due date', tone: 'none' };
  const now = new Date();
  const today = startOfDay();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const endOfToday = new Date(today.getTime() + 86_400_000 - 1);
  const withinWeek = new Date(today.getTime() + 7 * 86_400_000);

  if (date < today) return { label: `Overdue · ${formatDate(value)}`, tone: 'overdue' };
  if (date < now) return { label: `Due now · ${timeFmt.format(date)}`, tone: 'overdue' };
  if (date <= endOfToday) return { label: `Today · ${timeFmt.format(date)}`, tone: 'today' };
  if (date < tomorrow) return { label: `Tomorrow · ${timeFmt.format(date)}`, tone: 'soon' };
  if (date < withinWeek) return { label: `${weekdayFmt.format(date)} · ${timeFmt.format(date)}`, tone: 'soon' };
  return { label: formatDate(value), tone: 'later' };
}

export function reminderInfo(value?: string | null): { label: string; absolute: string; due: boolean } {
  const date = parseDate(value);
  if (!date) return { label: '', absolute: '', due: false };
  const diff = date.getTime() - Date.now();
  const absolute = parseDate(value) ? fullFmt.format(date) : '';
  if (diff <= 60_000) return { label: diff < -60_000 ? 'Due' : 'Due now', absolute, due: true };
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return { label: `in ${minutes} min`, absolute, due: false };
  const hours = Math.round(minutes / 60);
  if (hours < 24) return { label: `in ${hours} h`, absolute, due: false };
  const days = Math.round(hours / 24);
  return { label: `in ${days} d`, absolute, due: false };
}

export function relativeTime(value?: string | null): string {
  const date = parseDate(value);
  if (!date) return 'never';
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return formatDate(value);
}

export function toInputValue(iso?: string | null): string {
  const date = parseDate(iso);
  if (!date) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromInputValue(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function dateInputValue(iso?: string | null): string {
  const date = parseDate(iso);
  if (!date) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromDateInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function defaultReminderValue(minutesFromNow = 60): string {
  return toInputValue(new Date(Date.now() + minutesFromNow * 60_000).toISOString());
}

export function daysFromNowAt(days: number, hour = 9): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return toInputValue(date.toISOString());
}

export function tomorrowAt(hour = 9): string {
  return daysFromNowAt(1, hour);
}

export function isDueToday(value?: string | null): boolean {
  const date = parseDate(value);
  if (!date) return false;
  return date.getTime() <= startOfDay().getTime() + 86_400_000 - 1;
}

export function isOverdue(value?: string | null): boolean {
  const date = parseDate(value);
  return Boolean(date && date.getTime() < Date.now());
}

/** True when the date falls on an earlier calendar day than today. */
export function isBeforeToday(value?: string | null): boolean {
  const date = parseDate(value);
  return Boolean(date && date.getTime() < startOfDay().getTime());
}

export function todayHeading(): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());
}
