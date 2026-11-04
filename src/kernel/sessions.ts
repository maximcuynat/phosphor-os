// TTY1 to TTY4 session data: user, folder, env, aliases, history.

import type { OSState, SessionData } from './types';

export const TTY_COUNT = 4;
export const HISTORY_MAX = 100;

export function baseEnv(user: string): Record<string, string> {
  // Key order matters: SET lists PATH, PROMPT, USER, TEMP (board [10]).
  return { PATH: 'A:\\SYSTEM', PROMPT: '$U@$P$G', USER: user, TEMP: 'C:\\TEMP' };
}

export function newSession(tty: number): SessionData {
  return { tty, user: null, cwd: 'A:\\', env: {}, aliases: {}, history: [], screen: 'login' };
}

export function defaultSessions(): SessionData[] {
  return Array.from({ length: TTY_COUNT }, (_, i) => newSession(i + 1));
}

/** Logs a session out but keeps its history. */
export function resetSession(s: SessionData): void {
  s.user = null;
  s.cwd = 'A:\\';
  s.env = {};
  s.aliases = {};
  s.screen = 'login';
}

export function startSession(s: SessionData, user: string): void {
  s.user = user;
  s.cwd = 'A:\\';
  s.env = baseEnv(user);
  s.aliases = {};
  s.screen = 'console';
}

export function pushHistory(s: SessionData, line: string): void {
  const l = line.trim();
  if (!l) return;
  if (s.history[s.history.length - 1] !== l) s.history.push(l);
  if (s.history.length > HISTORY_MAX) s.history.splice(0, s.history.length - HISTORY_MAX);
}

export function session(state: OSState, tty: number): SessionData {
  return state.sessions[tty - 1];
}
