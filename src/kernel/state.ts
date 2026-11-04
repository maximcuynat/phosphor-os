// Global state: default, load and save (localStorage key phosphor.state.v1).

import { STORAGE_KEY } from '../config';
import { defaultDrives } from '../data/default-disk';
import { defaultSessions } from './sessions';
import { DEFAULT_SETTINGS, type OSState } from './types';
import { defaultUsers } from './users';

export function defaultState(): OSState {
  return {
    version: 1,
    drives: defaultDrives(),
    users: defaultUsers(),
    sessions: defaultSessions(),
    processes: [],
    tasks: [],
    log: [],
    clipboard: null,
    settings: { ...DEFAULT_SETTINGS },
    installed: [],
    counters: { pid: 1, task: 1, boot: 0 },
  };
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function storage(): Store | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** Loads the saved state, filling any missing part with defaults. Corrupt data falls back to a fresh disk. */
export function loadState(store: Store | null = storage()): OSState {
  const def = defaultState();
  if (!store) return def;
  let raw: string | null = null;
  try {
    raw = store.getItem(STORAGE_KEY);
  } catch {
    return def;
  }
  if (!raw) return def;
  try {
    const s = JSON.parse(raw) as Partial<OSState>;
    if (s.version !== 1 || !s.drives?.A?.root) return def;
    return {
      ...def,
      ...s,
      settings: { ...def.settings, ...(s.settings ?? {}) },
      counters: { ...def.counters, ...(s.counters ?? {}) },
      sessions: s.sessions?.length === 4 ? s.sessions : def.sessions,
      installed: s.installed ?? [],
    } as OSState;
  } catch {
    return def;
  }
}

export function saveState(state: OSState, store: Store | null = storage()): void {
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked: keep running in memory */
  }
}

export function clearState(store: Store | null = storage()): void {
  try {
    store?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
