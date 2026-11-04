// Build-time configuration.

/**
 * Initial passwords of the starting accounts (brief §9: [À COMPLÉTER]).
 * Empty string = no password: the account logs in with an empty password
 * and is told to set one with PASSWD. Fill these before shipping.
 */
export const INITIAL_PASSWORDS: Record<string, string> = {
  ADMIN: '',
  USER: '',
  GUEST: '',
};

export const STORAGE_KEY = 'phosphor.state.v1';

/** Memory model (brief §8, board [18]). */
export const MEM_TOTAL_K = 640;
export const MEM_KERNEL_K = 96;
export const MEM_DRIVERS_K = 64;
export const MEM_BUFFERS_K = 114;
export const MEM_SHELL_K = 24;

/** Login: tries before lock, lock duration. */
export const LOGIN_MAX_TRIES = 3;
export const LOGIN_LOCK_MS = 60_000;

export const VERSION = '1.0';
