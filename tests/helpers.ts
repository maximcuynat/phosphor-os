import { APPS } from '../src/apps/registry';
import { key } from '../src/input';
import { setNow } from '../src/kernel/clock';
import { defaultState } from '../src/kernel/state';
import { OS } from '../src/os';
import { Screen } from '../src/render/screen';
import { COMMANDS } from '../src/shell/commands';

/** 4 November 1984-ish: real date 2026-11-04 09:40 local time. */
export const T0 = new Date(2026, 10, 4, 9, 40, 0).getTime();

export function newOS(): OS {
  setNow(T0);
  return new OS({ state: defaultState(), noSave: true, apps: APPS, commands: COMMANDS });
}

export function tick(os: OS, ms: number, step = 100): void {
  for (let t = 0; t < ms; t += step) os.tick(step);
}

/** Power on and wait for the login screen. */
export function bootOS(): OS {
  const os = newOS();
  os.powerOn();
  tick(os, 6000);
  if (os.mode !== 'running') throw new Error(`boot did not finish: ${os.mode}`);
  return os;
}

export function type(os: OS, text: string): void {
  for (const ch of text) os.key(key(ch));
}

export function press(os: OS, combo: string): void {
  os.key(key(combo));
}

/** Types a line and presses Enter. */
export function run(os: OS, line: string): void {
  type(os, line);
  press(os, 'enter');
}

export function login(os: OS, user = 'ADMIN', password = ''): void {
  type(os, user);
  press(os, 'tab');
  type(os, password);
  press(os, 'enter');
  if (!os.tty.loggedIn) throw new Error('login failed: ' + screen(os));
}

export function screen(os: OS): string {
  const s = new Screen();
  os.render(s);
  return s.text();
}

/** Console scrollback of the visible TTY as plain text lines. */
export function consoleLines(os: OS): string[] {
  return os.tty.console.lines.map((l) => l.map((s) => s.text).join(''));
}

/** Lines printed since the given index. */
export function since(os: OS, from: number): string[] {
  return consoleLines(os).slice(from);
}
