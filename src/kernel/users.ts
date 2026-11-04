// Accounts, login and lock-out (board [05], [23]).

import { INITIAL_PASSWORDS, LOGIN_LOCK_MS, LOGIN_MAX_TRIES } from '../config';
import { stamp } from './clock';
import type { OSState, Role, User } from './types';

/** FNV-1a 32-bit, salted. Enough for a toy OS; never reuse real passwords here. */
export function hashPassword(pw: string): string {
  if (!pw) return '';
  let h = 0x811c9dc5;
  const s = `phosphor:${pw.toUpperCase()}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function defaultUsers(): User[] {
  const mk = (name: string, role: Role): User => ({
    name,
    role,
    passwordHash: hashPassword(INITIAL_PASSWORDS[name] ?? ''),
    failedTries: 0,
    lockedUntil: null,
    lastLogin: null,
  });
  return [mk('ADMIN', 'admin'), mk('USER', 'user'), mk('GUEST', 'guest')];
}

export function findUser(state: OSState, name: string): User | undefined {
  return state.users.find((u) => u.name === name.trim().toUpperCase());
}

export type LoginResult =
  | { ok: true; user: User; previousLogin: string | null }
  | { ok: false; message: string; locked: boolean };

export function lockSecondsLeft(u: User, now: number): number {
  return u.lockedUntil && u.lockedUntil > now ? Math.ceil((u.lockedUntil - now) / 1000) : 0;
}

/** Checks a login attempt and updates tries / lock. */
export function attemptLogin(state: OSState, name: string, password: string, now: number, tty: number): LoginResult {
  const u = findUser(state, name);
  if (!u) return { ok: false, message: `UNKNOWN USER ${name.trim().toUpperCase() || '(EMPTY)'}.  TYPE ADMIN, USER OR GUEST.`, locked: false };
  const left = lockSecondsLeft(u, now);
  if (left > 0) return { ok: false, message: `ACCOUNT LOCKED.  TRY AGAIN IN ${left} S.`, locked: true };
  if (u.lockedUntil) {
    u.lockedUntil = null;
    u.failedTries = 0;
  }
  if (u.role !== 'guest' && hashPassword(password) !== u.passwordHash) {
    u.failedTries++;
    if (u.failedTries >= LOGIN_MAX_TRIES) {
      u.failedTries = 0;
      u.lockedUntil = now + LOGIN_LOCK_MS;
      return { ok: false, message: `ACCOUNT LOCKED.  TRY AGAIN IN ${LOGIN_LOCK_MS / 1000} S.`, locked: true };
    }
    const n = LOGIN_MAX_TRIES - u.failedTries;
    return { ok: false, message: `LOGIN INCORRECT.  ${n} ATTEMPT${n > 1 ? 'S' : ''} LEFT.`, locked: false };
  }
  const previousLogin = u.lastLogin;
  u.failedTries = 0;
  u.lockedUntil = null;
  u.lastLogin = stamp(now);
  u.lastTty = tty;
  return { ok: true, user: u, previousLogin };
}

export function setPassword(u: User, pw: string): void {
  u.passwordHash = hashPassword(pw);
}

export function checkPassword(u: User, pw: string): boolean {
  return hashPassword(pw) === u.passwordHash;
}
