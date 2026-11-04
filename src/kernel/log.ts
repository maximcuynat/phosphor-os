// EVENTS.LOG: every error and warning, plus key info events.

import { dateStr, hhmmss, now } from './clock';
import type { Level, LogEntry, OSState } from './types';

export const LOG_MAX = 1000;
export const EVENTS_LOG_PATH = 'A:\\SYSTEM\\EVENTS.LOG';

export function addLog(state: OSState, level: Level, user: string, msg: string): LogEntry {
  const e: LogEntry = { t: hhmmss(now()), d: dateStr(now()), level, user: user || 'SYSTEM', msg: msg.replace(/\s+/g, ' ').trim() };
  state.log.push(e);
  if (state.log.length > LOG_MAX) state.log.splice(0, state.log.length - LOG_MAX);
  return e;
}

export function formatLogLine(e: LogEntry): string {
  return `${e.d} ${e.t}  ${e.level.padEnd(5)}  ${e.user.padEnd(6)}  ${e.msg}`;
}

/** Text content of A:\SYSTEM\EVENTS.LOG. */
export function formatLog(state: OSState): string {
  return state.log.map(formatLogLine).join('\n');
}
