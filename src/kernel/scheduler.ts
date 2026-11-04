// AT tasks: run a command at HH:MM (today, or tomorrow if already past).

import { OsError } from './errors';
import type { OSState, Task } from './types';

const p2 = (n: number) => String(n).padStart(2, '0');

export function parseHHMM(s: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return { h, m: mi };
}

/** Schedules a task. Returns the existing task when the same one is already scheduled. */
export function schedule(state: OSState, hhmm: string, cmd: string, user: string, nowMs: number): { task: Task; existed: boolean } {
  const t = parseHHMM(hhmm);
  if (!t) throw new OsError(`BAD TIME ${hhmm}.  USE HH:MM, FOR EXAMPLE AT 18:00 BACKUP.BAT`);
  const due = new Date(nowMs);
  due.setHours(t.h, t.m, 0, 0);
  if (due.getTime() <= nowMs) due.setDate(due.getDate() + 1);
  const at = `1984-${p2(due.getMonth() + 1)}-${p2(due.getDate())}T${p2(t.h)}:${p2(t.m)}`;
  const command = cmd.trim().toUpperCase();
  const same = state.tasks.find((x) => x.at === at && x.cmd === command && x.user === user);
  if (same) return { task: same, existed: true };
  const task: Task = { id: state.counters.task++, at, due: due.getTime(), cmd: command, user };
  state.tasks.push(task);
  return { task, existed: false };
}

/** Removes and returns the tasks that are due. */
export function takeDue(state: OSState, nowMs: number): Task[] {
  const due = state.tasks.filter((t) => t.due <= nowMs);
  if (due.length) state.tasks = state.tasks.filter((t) => t.due > nowMs);
  return due;
}

export function cancelTask(state: OSState, id: number): Task | undefined {
  const i = state.tasks.findIndex((t) => t.id === id);
  return i < 0 ? undefined : state.tasks.splice(i, 1)[0];
}

export function nextTask(state: OSState): Task | undefined {
  return [...state.tasks].sort((a, b) => a.due - b.due)[0];
}
