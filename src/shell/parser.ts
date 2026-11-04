// Grammar: command [args] [> file | >> file] [| command ...] [&]
// Variables (%VAR%) and aliases are expanded before parsing.

import { OsError } from '../kernel/errors';
import { lex, splitUnquoted } from './lexer';

export interface SimpleCmd {
  name: string;
  args: string[];
  quoted: boolean[];
  /** Raw text of the arguments, spacing kept (ECHO). */
  rest: string;
  /** Redirection of this command's output. */
  redirect: { path: string; append: boolean } | null;
}

export interface Pipeline {
  cmds: SimpleCmd[];
  background: boolean;
}

const USAGE = 'CMD [ARGS] [> FILE] [| CMD] [&]';

export function parse(line: string): Pipeline {
  const toks = lex(line);
  const cmds: SimpleCmd[] = [];
  let cur: SimpleCmd | null = null;
  const span = new Map<SimpleCmd, { start: number; end: number }>();
  let background = false;
  for (let i = 0; i < toks.length; i++) {
    const tk = toks[i];
    if (background) throw new OsError(`SYNTAX ERROR AFTER &.  USAGE: ${USAGE}`);
    switch (tk.t) {
      case 'word':
        if (!cur) {
          cur = { name: tk.v.toUpperCase(), args: [], quoted: [], rest: '', redirect: null };
          cmds.push(cur);
        } else {
          cur.args.push(tk.v);
          cur.quoted.push(tk.quoted);
          const sp = span.get(cur);
          span.set(cur, { start: sp ? sp.start : tk.start, end: tk.end });
        }
        break;
      case 'pipe':
        if (!cur) throw new OsError(`SYNTAX ERROR NEAR |.  USAGE: ${USAGE}`);
        cur = null;
        break;
      case 'gt':
      case 'gtgt': {
        const next = toks[i + 1];
        if (!cur || !next || next.t !== 'word') throw new OsError(`SYNTAX ERROR NEAR ${tk.t === 'gt' ? '>' : '>>'}.  USAGE: ${USAGE}`);
        cur.redirect = { path: next.v.toUpperCase(), append: tk.t === 'gtgt' };
        i++;
        break;
      }
      case 'amp':
        if (!cur) throw new OsError(`SYNTAX ERROR NEAR &.  USAGE: ${USAGE}`);
        background = true;
        break;
    }
  }
  if (cmds.length && !cur) throw new OsError(`SYNTAX ERROR NEAR |.  USAGE: ${USAGE}`);
  for (const c of cmds) {
    const sp = span.get(c);
    c.rest = sp ? line.slice(sp.start, sp.end) : '';
  }
  return { cmds, background };
}

/** Expands %VAR% from env (case-insensitive). Unknown variables become empty. %% stays %. */
export function expandVars(line: string, env: Record<string, string>): string {
  return line.replace(/%([A-Z_][A-Z0-9_]*)%/gi, (_, name: string) => {
    const key = Object.keys(env).find((k) => k.toUpperCase() === name.toUpperCase());
    return key !== undefined ? env[key] : '';
  });
}

/** Replaces the first word of each pipe segment by its alias, once. */
export function expandAliases(line: string, aliases: Record<string, string>): string {
  if (!Object.keys(aliases).length) return line;
  return splitUnquoted(line, '|')
    .map((seg) => {
      const m = /^(\s*)(\S+)(.*)$/s.exec(seg);
      if (!m) return seg;
      const a = aliases[m[2].toUpperCase()];
      return a !== undefined ? m[1] + a + m[3] : seg;
    })
    .join('|');
}
