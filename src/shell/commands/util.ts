// Helpers shared by commands.

import { stampDate, stampTime } from '../../kernel/clock';
import { OsError } from '../../kernel/errors';
import { fullName, hasWildcard, join, type Vfs } from '../../kernel/vfs';
import type { FsNode } from '../../kernel/types';
import type { CmdCtx } from '../types';

export const flags = (c: CmdCtx): string[] => c.args.filter((a) => a.startsWith('/')).map((a) => a.toUpperCase());
export const params = (c: CmdCtx): string[] => c.args.filter((a) => !a.startsWith('/'));
export const num = (n: number): string => n.toLocaleString('en-US');

export function usage(c: CmdCtx): never {
  const cmd = c.os.commands.get(c.name);
  throw new OsError(`REQUIRED PARAMETER MISSING.  USAGE: ${cmd?.usage ?? c.name}`);
}

/** Absolute paths of the files matching a user argument (wildcards allowed). Throws FILE NOT FOUND. */
export function matchFiles(c: CmdCtx, arg: string, opts: { dirs?: boolean; hidden?: boolean } = {}): string[] {
  const vfs: Vfs = c.vfs;
  const abs = c.abs(arg);
  const { dir, nodes } = vfs.glob(abs, c.cwd, { dirs: opts.dirs, hidden: opts.hidden || !hasWildcard(arg) });
  if (!nodes.length) {
    if (hasWildcard(arg)) throw new OsError(`FILE NOT FOUND: ${arg.toUpperCase()}.  TYPE DIR TO LIST FILES.`);
    throw vfs.notFound(abs);
  }
  return nodes.map((n) => join(dir, fullName(n)));
}

/** One DIR line: " README   TXT          1,204  11-04-84   09:30" */
export function dirLine(n: FsNode): string {
  const size = n.type === 'dir' ? '     <DIR>     ' : num(n.content !== null ? n.content.length : n.size).padStart(15);
  const name = n.type === 'dir' ? n.name.padEnd(12) : `${n.name.padEnd(8)} ${n.ext.padEnd(3)}`;
  return ` ${name}${size}  ${stampDate(n.modified)}   ${stampTime(n.modified)}`;
}

/** Packs words into lines of at most width chars, with a separator and an indent. */
export function pack(words: string[], width = 78, sep = '  ', indent = '  '): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? cur + sep + w : indent + w;
    if (next.length > width && cur) {
      lines.push(cur);
      cur = indent + w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}
