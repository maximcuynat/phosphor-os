// Shared drawing helpers for full-screen programs.

import { COLS, type Screen, type Style } from '../render/screen';

/** Logs and draws nothing: a message line for programs (error inverse, warn bright, info dim). */
export interface Msg {
  text: string;
  level: 'ERROR' | 'WARN' | 'INFO';
}

export function msgStyle(level: Msg['level']): Style {
  return level === 'ERROR' ? 'i' : level === 'WARN' ? 'b' : 'd';
}

export function drawMsg(s: Screen, y: number, m: Msg | null, x = 0): void {
  if (!m) return;
  s.put(x, y, m.text.slice(0, COLS - x), msgStyle(m.level));
}

/** Centred label sitting on a panel's top border: " A:\ " */
export function borderTitle(s: Screen, x: number, y: number, w: number, title: string, style: Style = 'i'): void {
  const t = ` ${title} `;
  s.put(x + Math.floor((w - t.length) / 2), y, t, style);
}

/** Text field: value with an underline rule, cursor at the end when focused. */
export function field(s: Screen, x: number, y: number, w: number, value: string, focused: boolean): void {
  s.put(x, y, value.slice(0, w));
  s.hline(x, y + 0.45, w, focused ? 'n' : 'd');
  if (focused) s.setCursor(x + Math.min(value.length, w - 1), y);
}

/** Number with thousands separators: 1,204 */
export function num(n: number): string {
  return n.toLocaleString('en-US');
}

/** Bytes to "115K" style. */
export function kb(bytes: number): string {
  return `${Math.floor(bytes / 1024)}K`;
}
