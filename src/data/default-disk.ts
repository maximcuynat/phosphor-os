// Starting disk (brief §9). Text contents follow the mockups:
// [16] README, [15] MANUAL chapter 4, [04] AUTOEXEC.BAT, [10] IDEAS.TXT.

import type { Drive, DriveId, FsNode } from '../kernel/types';
import { makeDir, makeFile } from '../kernel/vfs';
import { MANUAL_TXT } from './manual';

const T = (d: string, t = '09:30') => `1984-${d}T${t}`;

function file(full: string, content: string | null, attrs = '---A', modified = T('11-04'), size?: number): FsNode {
  return makeFile(full, content, { attrs, modified, size: size ?? (content ?? '').length });
}

function dir(full: string, children: FsNode[], attrs = '----', modified = T('11-01', '08:00')): FsNode {
  return makeDir(full, children, { attrs, modified });
}

export const AUTOEXEC_BAT = [
  'ECHO OFF',
  'SET PATH=A:\\SYSTEM;C:\\BIN',
  'SET PROMPT=$U@$P$G',
  'ALIAS LS=DIR /W',
  'LOAD PRN.DRV',
  'LOAD MODEM.DRV',
  'AT 18:00 BACKUP.BAT',
  'ECHO WELCOME, %USER%.  TYPE HELP FOR A LIST OF COMMANDS.',
].join('\n');

export const CONFIG_SYS = ['FILES=20', 'BUFFERS=114', 'DEVICE=A:\\SYSTEM\\CON.DRV', 'DEVICE=A:\\SYSTEM\\KBD.DRV', 'SHELL=A:\\SYSTEM\\SHELL.EXE'].join('\n');

export const README_TXT = [
  'PHOSPHOR OS 1.0  README',
  '=======================',
  '',
  'WELCOME TO PHOSPHOR OS.',
  '',
  'GETTING STARTED',
  '- TYPE FILES TO OPEN THE FILE MANAGER.',
  '- USE THE ARROW KEYS TO MOVE AROUND.',
  '- PRESS F4 ON A .TXT FILE TO EDIT IT.',
  '- PRESS F3 TO VIEW A FILE.',
  '',
  'SHORTCUTS IN EDIT',
  '- CTRL+S   SAVE',
  '- CTRL+F   FIND',
  '- ESC      BACK TO FILES',
  '',
  'HAVE FUN, AND MIND THE GLOW.',
].join('\n');

const NOTES_TXT = [
  'NOTES',
  '=====',
  '',
  'TYPE HELP TO LIST EVERY COMMAND, HELP COPY FOR ONE OF THEM.',
  'ALT+F1 TO ALT+F4 SWITCH BETWEEN THE FOUR CONSOLES.',
  'EACH CONSOLE HAS ITS OWN LOGIN, FOLDER AND HISTORY.',
  '',
  'DRIVES',
  '  A:  SYSTEM DISK, 360K FLOPPY',
  '  B:  DATA DISK, 360K FLOPPY',
  '  C:  HARD DISK, 21M',
  '',
  'DELETED FILES GO TO C:\\TRASH.  UNDEL BRINGS THEM BACK,',
  'EMPTY PURGES THE TRASH FOR GOOD.',
  '',
  'LONG JOBS CAN RUN IN THE BACKGROUND: END THE COMMAND WITH &.',
  'JOBS LISTS THEM, FG BRINGS ONE BACK, CTRL+Z SENDS IT BACK.',
].join('\n');

const TODO_TXT = ['TODO', '====', '', '[X] FORMAT THE DATA DISK', '[ ] BACK UP DOCS TO B:', '[ ] CALL THE GREEN ROOM BBS', '[ ] CHANGE THE ADMIN PASSWORD (PASSWD)', '[ ] INSTALL SNAKE FROM B:\\SNAKE.PKG'].join('\n');

const LOGO_ROWS = [
  '111 101 111 111 111 101 111 111',
  '101 101 101 100 101 101 101 101',
  '111 111 101 111 111 111 101 111',
  '100 101 101 001 100 101 101 110',
  '100 101 111 111 100 101 111 101',
];
export const LOGO_BITMAP = LOGO_ROWS;
const LOGO_TXT = ['', ...LOGO_ROWS.map((r) => '  ' + r.replace(/1/g, '##').replace(/0/g, '  ').replace(/ /g, ' ')), '', '  PHOSPHOR OS  VERSION 1.0', '  (C) 1984 PHOSPHOR SYSTEMS', ''].join('\n');

const SECRET_TXT = ['THE GREEN ROOM BBS', 'NUMBER: 555-0184', 'TYPE DIAL 555-0184 FROM THE CONSOLE.'].join('\n');

const CHANGES_TXT = [
  'CHANGES',
  '=======',
  '',
  'VERSION 1.0  11-01-84',
  '- FIRST RELEASE.',
  '- FOUR VIRTUAL CONSOLES (ALT+F1 TO ALT+F4).',
  '- FILE MANAGER WITH TRASH AND CLIPBOARD.',
  '- BACKGROUND JOBS, AT SCHEDULER, TOP.',
  '- MODEM SUPPORT ON COM1 (DIAL).',
  '',
  'VERSION 0.9  09-15-84',
  '- BETA FOR PHOSPHOR SYSTEMS STAFF.',
].join('\n');

export const IDEAS_TXT = [
  'IDEAS',
  '=====',
  'TODO  ADD A SNAKE GAME',
  '      PACKAGE IT AS SNAKE.PKG ON THE DATA DISK.',
  'MAYBE A CLOCK ON THE SCREENSAVER.',
  '      BIG DIGITS, DATE BELOW.',
  'DONE  FOUR CONSOLES INSTEAD OF TWO.',
  '      ALT+F1 TO ALT+F4.',
  'TODO  AMBER THEME IN SETUP',
  '      AND A WHITE ONE FOR THE OFFICE.',
].join('\n');

const LETTER1 = ['TO: THE GREEN ROOM BBS', 'FROM: ADMIN', '', 'HELLO NIGHTOWL,', '', 'THANKS FOR THE NEW FILE LIBRARY.', 'SNAKE 1.2 RUNS FINE ON PHOSPHOR OS.', '', 'SEE YOU ON NODE 1.'].join('\n');

const BACKUP_BAT = ['ECHO OFF', 'IF NOT EXIST B:\\BACKUP MKDIR B:\\BACKUP', 'COPY *.TXT B:\\BACKUP'].join('\n');

const CRASH_LOG = ['CRASH LOG', '========='].join('\n');

export const SNAKE_PKG = [
  'PKG SNAKE 1.2',
  'COMMAND SNAKE',
  'DEST C:\\GAMES\\SNAKE',
  'RAM 16',
  'REQUIRES PHOSPHOR OS 1.0',
  'FILE SNAKE.EXE 18432',
  'FILE SNAKE.HLP 2048',
  'FILE LEVELS.DAT 3120',
  'FILE SCORES.DAT 512',
].join('\n');

function trashed(n: FsNode, from: string, at: string): FsNode {
  return { ...n, from, deletedAt: at };
}

export function defaultDrives(): Record<DriveId, Drive> {
  const A = dir('', [
    file('AUTOEXEC.BAT', AUTOEXEC_BAT, '---A', T('11-04', '08:12')),
    file('CONFIG.SYS', CONFIG_SYS, 'RS--', T('10-28', '17:20')),
    file('README.TXT', README_TXT, '---A', T('11-04', '09:30')),
    file('NOTES.TXT', NOTES_TXT, '---A', T('11-02', '14:05')),
    file('TODO.TXT', TODO_TXT, '---A', T('11-03', '18:12')),
    file('LOGO.TXT', LOGO_TXT, '----', T('10-30', '11:47')),
    file('PHOSPHOR.SYS', null, 'RSH-', T('10-28', '17:20'), 32768),
    file('SECRET.TXT', SECRET_TXT, '--H-', T('11-02', '22:10')),
    dir('DOCS', [
      file('MANUAL.TXT', MANUAL_TXT, '---A', T('11-01', '10:00')),
      file('CHANGES.TXT', CHANGES_TXT, '---A', T('11-01', '10:05')),
      file('IDEAS.TXT', IDEAS_TXT, '---A', T('11-03', '21:40')),
      file('BUDGET.DAT', null, '---A', T('11-02', '16:30'), 1536),
      dir('LETTERS', [file('BBS.LTR', LETTER1, '---A', T('11-02', '20:15'))]),
    ]),
    dir('GAMES', []),
    dir(
      'SYSTEM',
      [
        file('EVENTS.LOG', '', '---A', T('11-04', '09:40')),
        file('CRASH.LOG', CRASH_LOG, '---A', T('11-01', '08:00')),
        file('SHELL.EXE', null, 'RS--', T('10-28', '17:20'), 24576),
        file('CON.DRV', null, 'RS--', T('10-28', '17:20'), 6144),
        file('KBD.DRV', null, 'RS--', T('10-28', '17:20'), 4096),
        file('PRN.DRV', null, 'R---', T('10-28', '17:20'), 8192),
        file('MODEM.DRV', null, 'R---', T('10-28', '17:20'), 10240),
        file('FILES.EXE', null, 'R---', T('10-28', '17:20'), 43008),
        file('EDIT.EXE', null, 'R---', T('10-28', '17:20'), 36864),
        file('HELP.EXE', null, 'R---', T('10-28', '17:20'), 30720),
      ],
      '-SH-',
    ),
  ]);
  const B = dir('', [dir('BACKUP', []), file('SNAKE.PKG', SNAKE_PKG, '---A', T('11-02', '23:05'), 24576)]);
  const C = dir('', [
    dir('BIN', [
      file('BACKUP.BAT', BACKUP_BAT, '---A', T('11-01', '09:00')),
      file('PACK.EXE', null, '---A', T('10-28', '17:20'), 28672),
      file('UNPACK.EXE', null, '---A', T('10-28', '17:20'), 30720),
      file('PRINT.EXE', null, '---A', T('10-28', '17:20'), 12288),
      file('DIAL.EXE', null, '---A', T('10-28', '17:20'), 22528),
      file('TOP.EXE', null, '---A', T('10-28', '17:20'), 18432),
    ]),
    dir('TEMP', [file('TEMP.BAK', 'TEMPORARY FILE.', '---A', T('11-02', '10:00'))]),
    dir('TRASH', [
      trashed(file('DRAFT.TXT', 'DRAFT OF THE LETTER TO THE BBS.', '---A', T('11-03', '16:00')), 'A:\\DOCS', T('11-03', '16:20')),
      trashed(file('TEMP.DAT', null, '---A', T('11-02', '09:00'), 4096), 'C:\\TEMP', T('11-02', '11:00')),
      trashed(file('SCORES.DAT', null, '---A', T('10-30', '19:00'), 512), 'A:\\GAMES', T('10-30', '19:30')),
    ]),
    dir('GAMES', []),
  ]);
  return {
    A: { label: 'SYSTEM', capacity: 368640, ready: true, root: A },
    B: { label: 'DATA', capacity: 368640, ready: true, root: B },
    C: { label: 'HARD DISK', capacity: 22020096, ready: true, root: C },
  };
}
