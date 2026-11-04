// Keyboard normalisation. The mouse is ignored entirely.

export interface KeyEvent {
  /** DOM key name: 'Enter', 'Escape', 'ArrowUp', 'F8', 'a'... */
  key: string;
  /** Printable character (uppercased), or null. */
  ch: string | null;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  /**
   * Lowercase combo: 'enter', 'escape', 'arrowup', 'f8', 'shift+f8', 'ctrl+s', 'alt+f2', 'alt+1'.
   * Plain printable keys give the lowercase character ('y', '/', '+').
   */
  combo: string;
}

const NAMED: Record<string, string> = {
  Enter: 'enter',
  Escape: 'escape',
  Tab: 'tab',
  Backspace: 'backspace',
  Delete: 'delete',
  Insert: 'insert',
  Home: 'home',
  End: 'end',
  PageUp: 'pageup',
  PageDown: 'pagedown',
  ArrowUp: 'arrowup',
  ArrowDown: 'arrowdown',
  ArrowLeft: 'arrowleft',
  ArrowRight: 'arrowright',
  ' ': 'space',
};

/** Builds a KeyEvent from a DOM KeyboardEvent (or a plain object in tests). */
export function normalize(e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>): KeyEvent | null {
  if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Dead'].includes(e.key)) return null;
  // macOS keeps F1-F12 for brightness, Mission Control, volume...: Ctrl+1..Ctrl+9, Ctrl+0
  // stand for F1..F10 (Ctrl+Shift+8 = Shift+F8). Only the real Ctrl key, not Cmd.
  if (e.ctrlKey && !e.altKey && !e.metaKey && /^Digit\d$/.test(e.code)) {
    const d = Number(e.code.slice(5));
    const f = `f${d === 0 ? 10 : d}`;
    return { key: f.toUpperCase(), ch: null, ctrl: false, alt: false, shift: e.shiftKey, combo: (e.shiftKey ? 'shift+' : '') + f };
  }
  const ctrl = e.ctrlKey || e.metaKey;
  const alt = e.altKey;
  const shift = e.shiftKey;
  let base: string;
  if (/^F\d{1,2}$/.test(e.key)) base = e.key.toLowerCase();
  else if (NAMED[e.key]) base = NAMED[e.key];
  else if ((ctrl || alt) && /^Key[A-Z]$/.test(e.code)) base = e.code.slice(3).toLowerCase();
  else if ((ctrl || alt) && /^Digit\d$/.test(e.code)) base = e.code.slice(5);
  else base = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  const mods = [ctrl ? 'ctrl' : '', alt ? 'alt' : '', shift && (base.length > 1 || ctrl || alt) ? 'shift' : ''].filter(Boolean);
  const combo = [...mods, base].join('+');
  const printable = !ctrl && !alt && e.key.length === 1 ? e.key.toUpperCase() : null;
  return { key: e.key, ch: printable, ctrl, alt, shift, combo };
}

/** Test helper: builds a KeyEvent from a combo or a character ('A', 'enter', 'ctrl+s', 'alt+f2'). */
export function key(spec: string): KeyEvent {
  if (spec.length === 1) {
    return { key: spec, ch: spec.toUpperCase(), ctrl: false, alt: false, shift: false, combo: spec === ' ' ? 'space' : spec.toLowerCase() };
  }
  const parts = spec.toLowerCase().split('+');
  const base = parts[parts.length - 1];
  const ctrl = parts.includes('ctrl');
  const alt = parts.includes('alt');
  const shift = parts.includes('shift');
  const rev = Object.fromEntries(Object.entries(NAMED).map(([k, v]) => [v, k]));
  const k = rev[base] ?? (/^f\d+$/.test(base) ? base.toUpperCase() : base);
  return { key: k, ch: base === 'space' && !ctrl && !alt ? ' ' : null, ctrl, alt, shift, combo: spec.toLowerCase() };
}
