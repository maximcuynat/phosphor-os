// Tab completion: commands for the first word, then files of the current folder.

import { fullName, hasAttr } from '../kernel/vfs';
import type { OS } from '../os';
import type { Tty } from '../tty';

export interface Completion {
  /** Start and end of the word being completed in the input. */
  start: number;
  end: number;
  options: string[];
}

export function commonPrefix(list: string[]): string {
  if (!list.length) return '';
  let p = list[0];
  for (const s of list) while (!s.startsWith(p)) p = p.slice(0, -1);
  return p;
}

export function complete(os: OS, tty: Tty, input: string, cursor: number): Completion {
  const before = input.slice(0, cursor);
  const start = Math.max(before.lastIndexOf(' '), before.lastIndexOf('|'), before.lastIndexOf('>')) + 1;
  const word = before.slice(start).toUpperCase();
  const head = before.slice(0, start).trim();
  const firstWord = head === '' || /[|]$/.test(head);
  let options: string[];
  if (firstWord) {
    const names = new Set<string>();
    for (const c of os.commandList) names.add(c.name);
    for (const a of Object.keys(tty.session.aliases)) names.add(a);
    for (const p of os.state.installed) names.add(p.command);
    try {
      for (const n of os.vfs.list(tty.session.cwd)) if (n.ext === 'BAT') names.add(fullName(n));
    } catch {
      /* not ready */
    }
    options = [...names].filter((n) => n.startsWith(word)).sort();
  } else {
    const slash = word.lastIndexOf('\\');
    const dirPart = slash >= 0 ? word.slice(0, slash + 1) : /^[A-C]:/.test(word) ? word.slice(0, 2) : '';
    const namePart = word.slice(dirPart.length);
    options = [];
    try {
      const dir = dirPart ? os.vfs.abs(dirPart, tty.session.cwd) : tty.session.cwd;
      options = os.vfs
        .list(dir)
        .filter((n) => !hasAttr(n, 'H') && fullName(n).startsWith(namePart))
        .map((n) => dirPart + fullName(n) + (n.type === 'dir' ? '\\' : ''));
    } catch {
      options = [];
    }
  }
  return { start, end: cursor, options };
}
