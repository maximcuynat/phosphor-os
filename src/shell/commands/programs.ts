// Program launchers: FILES VIEW EDIT HELP TOP SYSINFO CHKDSK LOG DIAL HANGUP INSTALL UNINSTALL.

import { OsError } from '../../kernel/errors';
import type { DriveId } from '../../kernel/types';
import { basename } from '../../kernel/vfs';
import type { CmdCtx, Command } from '../types';
import { flags, pack, params } from './util';
import { findTopic, type HelpTopic } from '../../data/help';

const MAX_EDIT = 65536;

export const FILES: Command = {
  name: 'FILES',
  usage: 'FILES [FOLDER]',
  summary: 'OPEN THE FILE MANAGER.',
  group: 'PROGRAMS',
  run(c) {
    const p = params(c)[0];
    const path = p ? c.abs(p) : c.cwd;
    c.vfs.dir(path);
    c.launch('files', [path]);
  },
};

export const VIEW: Command = {
  name: 'VIEW',
  usage: 'VIEW FILE',
  summary: 'READ A FILE PAGE BY PAGE.',
  group: 'PROGRAMS',
  minArgs: 1,
  run(c) {
    const abs = c.abs(params(c)[0]);
    c.vfs.file(abs);
    c.launch('view', [abs]);
  },
};

export const EDIT: Command = {
  name: 'EDIT',
  usage: 'EDIT FILE',
  summary: 'EDIT A TEXT FILE (UP TO 64K).  A NEW NAME MAKES A NEW FILE.',
  group: 'PROGRAMS',
  minArgs: 1,
  run(c) {
    const abs = c.abs(params(c)[0]);
    const n = c.vfs.get(abs);
    if (n && n.type === 'dir') throw new OsError(`${basename(abs)} IS A FOLDER.  NAME A FILE TO EDIT.`);
    if (n && n.content === null) throw new OsError(`${basename(abs)} IS A BINARY FILE.  OPEN IT WITH VIEW.`);
    if (n && n.content !== null && n.content.length > MAX_EDIT) {
      const asked = c.ask({
        prompt: 'FILE TOO LARGE TO EDIT (MAX 64K).  OPEN IN VIEW? (Y/N)',
        style: 'b',
        keys: ['Y', 'N', 'ESC'],
        onAnswer: (k) => {
          if (k !== 'Y') return;
          const err = c.os.openApp(c.tty, 'view', [abs]);
          if (err) c.tty.console.io.error(err);
        },
      });
      if (!asked) throw new OsError('FILE TOO LARGE TO EDIT (MAX 64K).  USE VIEW.');
      return;
    }
    c.launch('edit', [abs]);
  },
};

const HELP_ORDER = ['PROGRAMS', 'FILES', 'SHELL', 'PROCESSES', 'SESSION'] as const;
type Group = (typeof HELP_ORDER)[number];
/** Section names typed after HELP. They never clash with a command name. */
const SECTIONS: Record<string, { group: Group; title: string }> = {
  PROGRAMS: { group: 'PROGRAMS', title: 'PROGRAMS: FULL-SCREEN TOOLS' },
  DISKS: { group: 'FILES', title: 'DISKS: FILES AND FOLDERS' },
  SHELL: { group: 'SHELL', title: 'SHELL: VARIABLES, ALIASES, SCRIPTS' },
  PROCESSES: { group: 'PROCESSES', title: 'PROCESSES: JOBS, MEMORY, PRINTING' },
  SESSION: { group: 'SESSION', title: 'SESSION: USERS AND POWER' },
};
const sectionOf = (g: Group) => Object.keys(SECTIONS).find((k) => SECTIONS[k].group === g)!;

/** Short card printed by HELP <COMMAND>: what it does, its arguments, examples. */
function helpCard(io: CmdCtx['io'], t: HelpTopic): void {
  const W = 80;
  io.line([{ text: t.title, style: 'b' }, { text: `  ${t.summary}` }]);
  t.syntax.forEach((u, i) => io.line([{ text: i ? '        ' : 'USAGE   ', style: 'd' }, { text: u, style: 'b' }]));
  if (t.args.length) {
    const col = Math.min(16, Math.max(...t.args.map((a) => a.name.length)) + 2);
    for (const a of t.args) io.line([{ text: '        ' }, { text: a.name.padEnd(col), style: 'b' }, { text: a.desc.slice(0, W - 8 - col) }]);
  }
  t.examples.slice(0, 3).forEach((ex, i) => {
    const label = { text: i ? '        ' : 'EXAMPLE ', style: 'd' as const };
    if (8 + ex.cmd.length + 3 + ex.desc.length <= W) io.line([label, { text: ex.cmd }, { text: `   ${ex.desc}`, style: 'd' }]);
    else {
      io.line([label, { text: ex.cmd }]);
      io.line([{ text: '          ' }, { text: ex.desc, style: 'd' }]);
    }
  });
  if (t.seeAlso.length) io.line([{ text: 'SEE ALSO', style: 'd' }, { text: ` ${t.seeAlso.join('  ')}` }]);
  io.info(`  HELP ${t.id} /M OPENS THIS PAGE IN THE MANUAL.  F1 OPENS THE MANUAL.`);
}

export const HELP: Command = {
  name: 'HELP',
  usage: 'HELP [SECTION | COMMAND] [/M]',
  summary: 'LIST COMMANDS, OR EXPLAIN ONE COMMAND AND ITS ARGUMENTS.',
  group: 'PROGRAMS',
  run(c) {
    const topic = params(c)[0]?.toUpperCase();
    const manual = flags(c).includes('/M');
    if (!topic) {
      if (manual && !c.io.captured && !c.batch) {
        c.launch('help', []);
        return;
      }
      // Summary that fits one screen: each section with its command names.
      c.io.print('HELP SECTIONS', 'b');
      for (const g of HELP_ORDER) {
        const names = c.os.commandList.filter((y) => y.group === g).map((y) => y.name);
        pack(names, 66, '  ', '').forEach((l, i) => c.io.line([{ text: `  ${i ? '' : sectionOf(g)}`.padEnd(13), style: 'b' }, { text: l }]));
      }
      c.io.info('HELP <SECTION>: ONE LINE PER COMMAND.  HELP <COMMAND>: ITS ARGUMENTS.');
      c.io.info('PGUP/PGDN OR SHIFT+UP/DOWN SCROLL THE CONSOLE (FN+UP/DOWN ON A MAC).');
      return;
    }
    const section = SECTIONS[topic];
    if (section) {
      c.io.print(section.title, 'b');
      for (const x of c.os.commandList.filter((y) => y.group === section.group)) {
        const sum = findTopic(x.name)?.summary ?? x.summary;
        c.io.line([{ text: `  ${x.name.padEnd(10)}`, style: 'b' }, { text: sum.slice(0, 68) }]);
      }
      c.io.info(`TYPE HELP <COMMAND> FOR ITS ARGUMENTS, FOR EXAMPLE HELP ${c.os.commandList.find((y) => y.group === section.group)!.name}.`);
      return;
    }
    const cmd = c.os.commands.get(topic);
    const page = findTopic(cmd?.name ?? topic);
    if (manual && !c.io.captured && !c.batch) {
      c.launch('help', [cmd?.name ?? topic]);
      return;
    }
    if (page) {
      helpCard(c.io, page);
      return;
    }
    if (!cmd) throw new OsError(`NO HELP FOR ${topic}.  TYPE HELP FOR THE LIST.`);
    c.io.line([{ text: cmd.name, style: 'b' }, { text: `  ${cmd.summary}` }]);
    c.io.line([{ text: 'USAGE   ', style: 'd' }, { text: cmd.usage, style: 'b' }]);
  },
};

export const TOP: Command = {
  name: 'TOP',
  usage: 'TOP',
  summary: 'WATCH PROCESSES, CPU AND MEMORY LIVE.',
  group: 'PROGRAMS',
  run(c) {
    c.launch('top');
  },
};

export const SYSINFO: Command = {
  name: 'SYSINFO',
  usage: 'SYSINFO',
  summary: 'DISKS, MEMORY MAP AND DEVICES.',
  group: 'PROGRAMS',
  run(c) {
    c.launch('sysinfo');
  },
};

export const CHKDSK: Command = {
  name: 'CHKDSK',
  usage: 'CHKDSK [DRIVE:]',
  summary: 'CHECK A DISK FOR ERRORS.',
  group: 'FILES',
  run(c) {
    const d = (params(c)[0]?.replace(':', '').toUpperCase() || c.cwd[0]) as DriveId;
    if (!['A', 'B', 'C'].includes(d)) throw new OsError(`INVALID DRIVE ${d}:.  DRIVES ARE A:, B: AND C:.`);
    c.vfs.ensureReady(d);
    if (c.io.captured || c.batch) {
      const cap = c.os.state.drives[d].capacity;
      const used = c.vfs.used(d);
      c.io.print(`CHKDSK ${d}:  ${Math.round(cap / 1024).toLocaleString('en-US')}K TOTAL  ${Math.round(used / 1024)}K USED  ${Math.round((cap - used) / 1024)}K FREE`);
      c.io.print('0 LOST CHAINS.  DISK OK.');
      return;
    }
    c.launch('sysinfo', ['CHKDSK', `${d}:`]);
  },
};

export const LOG: Command = {
  name: 'LOG',
  usage: 'LOG',
  summary: 'READ EVENTS.LOG: ERRORS, WARNINGS AND SYSTEM EVENTS.',
  group: 'PROGRAMS',
  run(c) {
    c.launch('log');
  },
};

export const DIAL: Command = {
  name: 'DIAL',
  usage: 'DIAL NUMBER',
  summary: 'CALL A BULLETIN BOARD WITH THE MODEM ON COM1.',
  group: 'PROGRAMS',
  minArgs: 1,
  noSafe: true,
  run(c) {
    if (!c.os.loaded.has('MODEM.DRV')) throw new OsError('NO DIALTONE: MODEM.DRV IS NOT LOADED.  CHECK AUTOEXEC.BAT.');
    if (c.os.online) throw new OsError('COM1 IS ALREADY ONLINE.  TYPE HANGUP FIRST.');
    c.launch('dial', [params(c)[0]]);
  },
};

export const HANGUP: Command = {
  name: 'HANGUP',
  usage: 'HANGUP',
  summary: 'HANG UP THE MODEM.',
  group: 'PROGRAMS',
  run(c) {
    if (!c.os.online) {
      c.io.info('NOT CONNECTED.');
      return;
    }
    c.os.online = false;
    c.io.info('NO CARRIER');
  },
};

export const INSTALL: Command = {
  name: 'INSTALL',
  usage: 'INSTALL FILE.PKG',
  summary: 'INSTALL A .PKG PACKAGE AND ITS COMMAND.',
  group: 'PROGRAMS',
  minArgs: 1,
  noGuest: true,
  run(c) {
    const arg = params(c)[0];
    const abs = c.abs(arg.includes('.') ? arg : `${arg}.PKG`);
    c.vfs.file(abs);
    if (!abs.endsWith('.PKG')) throw new OsError(`${basename(abs)} IS NOT A PACKAGE.  INSTALL TAKES A .PKG FILE.`);
    c.launch('install', [abs]);
  },
};

export const UNINSTALL: Command = {
  name: 'UNINSTALL',
  usage: 'UNINSTALL NAME',
  summary: 'REMOVE AN INSTALLED PACKAGE.',
  group: 'PROGRAMS',
  minArgs: 1,
  noGuest: true,
  run(c) {
    const name = params(c)[0].toUpperCase();
    const st = c.os.state;
    const i = st.installed.findIndex((p) => p.name === name || p.command === name);
    if (i < 0) throw new OsError(`${name} IS NOT INSTALLED.  INSTALLED: ${st.installed.map((p) => p.name).join(', ') || 'NONE'}.`);
    const pkg = st.installed[i];
    if (c.vfs.exists(pkg.path)) c.vfs.deleteNow(pkg.path, { name: 'ADMIN', role: 'admin' });
    st.installed.splice(i, 1);
    c.log('INFO', `${pkg.name} UNINSTALLED`);
    c.io.info(`${pkg.name} ${pkg.version} REMOVED FROM ${pkg.path}.`);
  },
};

export const PROGRAM_COMMANDS = [FILES, VIEW, EDIT, HELP, TOP, SYSINFO, LOG, DIAL, HANGUP, INSTALL, UNINSTALL];
