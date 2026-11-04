// Shell commands: ECHO SET ALIAS UNALIAS CLS VER DATE TIME HISTORY LOAD IF FOR.

import { VERSION } from '../../config';
import { dateStr, hhmmss, weekday } from '../../kernel/clock';
import { OsError } from '../../kernel/errors';
import { basename, fullName } from '../../kernel/vfs';
import type { Command } from '../types';
import { params } from './util';

export const ECHO: Command = {
  name: 'ECHO',
  usage: 'ECHO [TEXT]',
  summary: 'PRINT A LINE OF TEXT.  ECHO OFF / ON IN .BAT FILES.',
  group: 'SHELL',
  run(c) {
    const text = c.rest;
    if (!text) {
      c.io.print(`ECHO IS ${c.batch && !c.batch.echo ? 'OFF' : 'ON'}`);
      return;
    }
    if (/^(OFF|ON)$/.test(text)) {
      if (c.batch) c.batch.echo = text === 'ON';
      return;
    }
    c.io.print(text === '.' ? '' : text.replace(/^\./, ''));
  },
};

export const SET: Command = {
  name: 'SET',
  usage: 'SET VAR=VALUE',
  summary: 'SHOW OR SET ENVIRONMENT VARIABLES.  READ ONE WITH %VAR%.',
  group: 'SHELL',
  run(c) {
    const env = c.session.env;
    const text = c.rest.trim();
    if (!text) {
      for (const [k, v] of Object.entries(env)) c.io.print(`  ${k}=${v}`);
      return;
    }
    const eq = text.indexOf('=');
    if (eq < 0) {
      const hits = Object.entries(env).filter(([k]) => k.startsWith(text.toUpperCase()));
      if (!hits.length) throw new OsError(`VARIABLE ${text.toUpperCase()} NOT SET.  USAGE: SET VAR=VALUE`);
      for (const [k, v] of hits) c.io.print(`  ${k}=${v}`);
      return;
    }
    const name = text.slice(0, eq).trim().toUpperCase();
    const value = text.slice(eq + 1);
    if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) throw new OsError(`BAD VARIABLE NAME ${name}.  USE A-Z, 0-9 AND _.`);
    if (name === 'USER') throw new OsError('USER IS SET AT LOGIN.  TYPE LOGIN TO CHANGE USER.');
    if (value === '') delete env[name];
    else env[name] = value;
  },
};

export const ALIAS: Command = {
  name: 'ALIAS',
  usage: 'ALIAS NAME=COMMAND',
  summary: 'MAKE A SHORTCUT COMMAND.  ALIAS ALONE LISTS THEM.',
  group: 'SHELL',
  run(c) {
    const a = c.session.aliases;
    const text = c.rest.trim();
    if (!text) {
      const list = Object.entries(a);
      if (!list.length) c.io.info('NO ALIASES.  TYPE ALIAS NAME=COMMAND TO MAKE ONE.');
      for (const [k, v] of list) c.io.print(`  ${k}=${v}`);
      return;
    }
    const eq = text.indexOf('=');
    if (eq < 0) {
      const v = a[text.toUpperCase()];
      if (v === undefined) throw new OsError(`NO ALIAS ${text.toUpperCase()}.  TYPE ALIAS TO LIST THEM.`);
      c.io.print(`  ${text.toUpperCase()}=${v}`);
      return;
    }
    const name = text.slice(0, eq).trim().toUpperCase();
    const value = text.slice(eq + 1).trim().toUpperCase();
    if (!/^[A-Z0-9_]{1,8}$/.test(name)) throw new OsError(`BAD ALIAS NAME ${name}.  USE UP TO 8 LETTERS OR DIGITS.`);
    if (!value) {
      delete a[name];
      c.io.info(`ALIAS ${name} REMOVED.`);
      return;
    }
    a[name] = value;
    if (!c.batch?.silent) c.io.info(`ALIAS ${name} CREATED.`); // AUTOEXEC.BAT at login: no noise
    c.log('INFO', `ALIAS ${name} CREATED`);
  },
};

export const UNALIAS: Command = {
  name: 'UNALIAS',
  usage: 'UNALIAS NAME',
  summary: 'REMOVE AN ALIAS.',
  group: 'SHELL',
  minArgs: 1,
  run(c) {
    const name = params(c)[0].toUpperCase();
    if (!(name in c.session.aliases)) throw new OsError(`NO ALIAS ${name}.  TYPE ALIAS TO LIST THEM.`);
    delete c.session.aliases[name];
    c.io.info(`ALIAS ${name} REMOVED.`);
  },
};

export const CLS: Command = {
  name: 'CLS',
  usage: 'CLS',
  summary: 'CLEAR THE SCREEN.',
  group: 'SHELL',
  run(c) {
    if (!c.io.captured) c.tty.console.clear();
  },
};

export const VER: Command = {
  name: 'VER',
  usage: 'VER',
  summary: 'SHOW THE SYSTEM VERSION.',
  group: 'SHELL',
  run(c) {
    c.io.print(`PHOSPHOR OS  VERSION ${VERSION}`);
  },
};

export const DATE: Command = {
  name: 'DATE',
  usage: 'DATE',
  summary: 'SHOW THE DATE.',
  group: 'SHELL',
  run(c) {
    c.io.print(`${weekday()} ${dateStr()}`);
  },
};

export const TIME: Command = {
  name: 'TIME',
  usage: 'TIME',
  summary: 'SHOW THE TIME.',
  group: 'SHELL',
  run(c) {
    c.io.print(hhmmss());
  },
};

export const HISTORY: Command = {
  name: 'HISTORY',
  usage: 'HISTORY',
  summary: 'LIST THE LAST COMMANDS OF THIS CONSOLE.  UP AND DOWN RECALL THEM.',
  group: 'SHELL',
  run(c) {
    const h = c.session.history.slice(-20);
    const base = c.session.history.length - h.length;
    h.forEach((l, i) => c.io.line([{ text: String(base + i + 1).padStart(4), style: 'd' }, { text: `  ${l}` }]));
  },
};

export const LOAD: Command = {
  name: 'LOAD',
  usage: 'LOAD DRIVER.DRV',
  summary: 'LOAD A DRIVER FROM A:\\SYSTEM (USED IN AUTOEXEC.BAT).',
  group: 'SHELL',
  minArgs: 1,
  noSafe: true,
  run(c) {
    const name = basename(c.abs(params(c)[0]));
    const path = `A:\\SYSTEM\\${name}`;
    if (!c.vfs.exists(path)) throw new OsError(`DRIVER NOT FOUND: ${name}.  FIX AUTOEXEC.BAT IN SAFE MODE (F8 AT BOOT).`);
    if (c.os.loaded.has(name)) return;
    c.os.loaded.add(name);
    c.log('INFO', `DRIVER ${name} LOADED`);
  },
};

export const IF: Command = {
  name: 'IF',
  usage: 'IF [NOT] EXIST FILE COMMAND  OR  IF [NOT] A==B COMMAND',
  summary: 'RUN A COMMAND ONLY IF A FILE EXISTS OR TWO WORDS MATCH.',
  group: 'SHELL',
  minArgs: 2,
  run(c) {
    const a = [...c.args];
    let neg = false;
    if (a[0]?.toUpperCase() === 'NOT') {
      neg = true;
      a.shift();
    }
    let cond: boolean;
    let rest: string[];
    if (a[0]?.toUpperCase() === 'EXIST') {
      if (!a[1]) throw new OsError(`REQUIRED PARAMETER MISSING.  USAGE: ${IF.usage}`);
      cond = c.vfs.exists(c.abs(a[1])) || c.vfs.glob(c.abs(a[1]), c.cwd).nodes.length > 0;
      rest = a.slice(2);
    } else {
      const m = /^(.*)==(.*)$/.exec(a[0] ?? '');
      if (!m) throw new OsError(`BAD CONDITION ${a[0] ?? ''}.  USAGE: ${IF.usage}`);
      cond = m[1].replace(/"/g, '') === m[2].replace(/"/g, '');
      rest = a.slice(1);
    }
    if (!rest.length) throw new OsError(`REQUIRED PARAMETER MISSING.  USAGE: ${IF.usage}`);
    if (cond !== neg) c.run(rest.join(' '));
  },
};

export const FOR: Command = {
  name: 'FOR',
  usage: 'FOR %%F IN (*.TXT) DO COMMAND %%F',
  summary: 'RUN A COMMAND FOR EACH FILE OR WORD OF A LIST.',
  group: 'SHELL',
  minArgs: 4,
  run(c) {
    const m = /^(%%?[A-Z])\s+IN\s+\((.*?)\)\s+DO\s+(.+)$/i.exec(c.rest.trim());
    if (!m) throw new OsError(`BAD FOR SYNTAX.  USAGE: ${FOR.usage}`);
    const v = m[1].toUpperCase();
    const letter = v.replace(/%/g, '');
    const items: string[] = [];
    for (const word of m[2].split(/[\s,]+/).filter(Boolean)) {
      if (/[*?]/.test(word)) {
        const { nodes } = c.vfs.glob(c.abs(word), c.cwd);
        items.push(...nodes.map((n) => fullName(n)));
      } else items.push(word.toUpperCase());
    }
    const re = new RegExp(`%%?${letter}(?![A-Z0-9_])`, 'gi');
    for (const it of items) c.run(m[3].replace(re, it));
  },
};

export const SHELL_COMMANDS = [ECHO, SET, ALIAS, UNALIAS, CLS, VER, DATE, TIME, HISTORY, LOAD, IF, FOR];
