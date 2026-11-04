// Fake clock: real local time and day, year shown as 84.
// Tests can freeze time with setNow().

let override: number | null = null;

export function now(): number {
  return override ?? Date.now();
}

/** Freezes the clock (tests). Pass null to unfreeze. */
export function setNow(ms: number | null): void {
  override = ms;
}

const p2 = (n: number) => String(n).padStart(2, '0');

/** "11-04-84" */
export function dateStr(ms = now()): string {
  const d = new Date(ms);
  return `${p2(d.getMonth() + 1)}-${p2(d.getDate())}-84`;
}

/** "09:42" */
export function hhmm(ms = now()): string {
  const d = new Date(ms);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** "09:42:05" */
export function hhmmss(ms = now()): string {
  const d = new Date(ms);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}

/** "1984-11-04T09:42" */
export function stamp(ms = now()): string {
  const d = new Date(ms);
  return `1984-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** "1984-11-04T09:42" -> "11-04-84" */
export function stampDate(s: string): string {
  const m = /^\d{4}-(\d\d)-(\d\d)/.exec(s);
  return m ? `${m[1]}-${m[2]}-84` : '01-01-84';
}

/** "1984-11-04T09:42" -> "09:42" */
export function stampTime(s: string): string {
  const m = /T(\d\d:\d\d)/.exec(s);
  return m ? m[1] : '00:00';
}

/** Duration in ms -> "00:09:12" */
export function duration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${p2(Math.floor(s / 3600))}:${p2(Math.floor((s % 3600) / 60))}:${p2(s % 60)}`;
}

export const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

/** Weekday name for 1984 with today's month/day. */
export function weekday(ms = now()): string {
  const d = new Date(ms);
  return DAYS[new Date(1984, d.getMonth(), d.getDate()).getDay()];
}
