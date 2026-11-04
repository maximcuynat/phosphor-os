// Clipboard: one file (copy or cut) or a piece of text.

import { basename } from './vfs';
import type { Clip, OSState } from './types';

export function setClip(state: OSState, clip: Clip | null): void {
  state.clipboard = clip;
}

export function getClip(state: OSState): Clip | null {
  return state.clipboard;
}

/** Short label for status bars: "README.TXT", "README.TXT (CUT)", "TEXT 12 CHARS", "EMPTY". */
export function clipLabel(state: OSState, withMode = false): string {
  const c = state.clipboard;
  if (!c) return 'EMPTY';
  if (c.kind === 'text') return `TEXT ${c.text.length} CHARS`;
  const name = basename(c.path);
  return withMode ? `${name} (${c.mode.toUpperCase()})` : name;
}
